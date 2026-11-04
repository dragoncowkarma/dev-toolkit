const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const MAX_SITEMAP_ENTRIES = 50000;
const CHANGE_FREQUENCIES = new Set([
  'always',
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'never',
]);
const KNOWN_EXTENSION_NAMESPACES = new Set([
  'http://www.google.com/schemas/sitemap-image/1.1',
  'http://www.google.com/schemas/sitemap-news/0.9',
  'http://www.google.com/schemas/sitemap-video/1.1',
  'http://www.w3.org/1999/xhtml',
]);
const EXTENSION_TYPES = new Map([
  ['http://www.google.com/schemas/sitemap-image/1.1', 'image'],
  ['http://www.google.com/schemas/sitemap-news/0.9', 'news'],
  ['http://www.google.com/schemas/sitemap-video/1.1', 'video'],
]);

function createIssue(severity, message, field = null) {
  return { severity, message, field };
}

function textOfDirectChild(element, name) {
  const child = Array.from(element.children)
    .find((item) => item.localName === name);
  return child ? child.textContent.trim() : '';
}

function getRawElementValues(xml, elementName) {
  const pattern = new RegExp(
    `<${elementName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${elementName}\\s*>`,
    'gi',
  );
  return Array.from(xml.matchAll(pattern), (match) => match[1].trim());
}

function hasUnescapedXmlCharacters(value) {
  const withoutEntities = value.replace(
    /&(amp|apos|quot|lt|gt|#\\d+|#x[0-9a-f]+);/gi,
    '',
  );
  return /[&'"<>]/.test(withoutEntities);
}

function isRealDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function parseExtensions(element) {
  return Array.from(element.children).flatMap((child) => {
    const type = EXTENSION_TYPES.get(child.namespaceURI);
    if (!type) return [];

    const location = textOfDirectChild(child, 'loc')
      || textOfDirectChild(child, 'content_loc')
      || textOfDirectChild(child, 'player_loc');
    return [{ type, location, title: textOfDirectChild(child, 'title') }];
  });
}

/**
 * Checks whether a value is a W3C date or ISO 8601 date-time with a real calendar date.
 *
 * @param {string} value Date value from a sitemap entry.
 * @returns {boolean} Whether the value is a supported W3C date-time value.
 */
export function isValidLastmod(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))?)?$/,
  );
  if (!match) return false;

  const [
    , yearText, monthText, dayText, hourText, minuteText, secondText,
    , offsetHourText, offsetMinuteText,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!isRealDate(year, month, day)) return false;
  if (!hourText) return true;

  return Number(hourText) <= 23
    && Number(minuteText) <= 59
    && Number(secondText) <= 59
    && (!offsetHourText
      || (Number(offsetHourText) <= 23 && Number(offsetMinuteText) <= 59));
}

/**
 * Checks that a location is an absolute URI that can be parsed by the browser URL API.
 *
 * @param {string} value Location value from a sitemap entry.
 * @returns {boolean} Whether the location is an absolute URI.
 */
export function isValidAbsoluteUrl(value) {
  if (typeof value !== 'string' || !value || /[\s"'<>]/.test(value)) return false;
  try {
    const url = new URL(value);
    return Boolean(url.protocol && /^[A-Za-z][A-Za-z\d+.-]*:$/.test(url.protocol));
  } catch {
    return false;
  }
}

/**
 * Validates a sitemap XML document and returns entries, aggregate metrics, and issues.
 *
 * @param {string} xml XML sitemap source.
 * @returns {{sitemapType: string|null, entries: Array, entryCount: number,
 *   validUrlCount: number, errors: Array, warnings: Array, extensions: string[],
 *   isValid: boolean}}
 */
export function validateSitemap(xml) {
  const report = {
    sitemapType: null,
    entries: [],
    entryCount: 0,
    validUrlCount: 0,
    errors: [],
    warnings: [],
    extensions: [],
    isValid: false,
  };

  if (typeof xml !== 'string' || xml.trim() === '') {
    report.errors.push(createIssue('error', 'Paste XML sitemap content to validate it.'));
    return report;
  }

  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const parserError = document.querySelector('parsererror');
  if (parserError) {
    report.errors.push(createIssue(
      'error',
      `Malformed XML: ${parserError.textContent.trim()}`,
    ));
    return report;
  }

  const root = document.documentElement;
  if (!root || !['urlset', 'sitemapindex'].includes(root.localName)) {
    report.errors.push(createIssue(
      'error',
      'Root element must be <urlset> or <sitemapindex>.',
    ));
    return report;
  }

  report.sitemapType = root.localName === 'urlset' ? 'urlset' : 'sitemapindex';
  if (root.namespaceURI && root.namespaceURI !== SITEMAP_NAMESPACE) {
    report.warnings.push(createIssue(
      'warning',
      'The root element does not use the standard sitemap namespace.',
    ));
  }

  Array.from(root.attributes).forEach((attribute) => {
    if (attribute.name === 'xmlns' || !attribute.name.startsWith('xmlns:')) return;
    if (attribute.value === SITEMAP_NAMESPACE
      || KNOWN_EXTENSION_NAMESPACES.has(attribute.value)) {
      report.extensions.push(attribute.value);
      return;
    }
    report.warnings.push(createIssue(
      'warning',
      `Unrecognized extension namespace: ${attribute.value}`,
    ));
  });

  const entryTag = report.sitemapType === 'urlset' ? 'url' : 'sitemap';
  const rawLocations = getRawElementValues(xml, 'loc');
  const entryElements = Array.from(root.children)
    .filter((element) => element.localName === entryTag);
  const locations = new Map();

  entryElements.forEach((element, index) => {
    const loc = textOfDirectChild(element, 'loc');
    const lastmod = textOfDirectChild(element, 'lastmod');
    const changefreq = textOfDirectChild(element, 'changefreq');
    const priority = textOfDirectChild(element, 'priority');
    const extensions = parseExtensions(element);
    const issues = [];
    const rawLoc = rawLocations[index] ?? '';

    if (!loc) {
      issues.push(createIssue('error', '<loc> is required.', 'loc'));
    } else if (hasUnescapedXmlCharacters(rawLoc)) {
      issues.push(createIssue(
        'error',
        '<loc> contains XML characters that must be entity-escaped.',
        'loc',
      ));
    } else if (!isValidAbsoluteUrl(loc)) {
      issues.push(createIssue('error', '<loc> must be a valid absolute URI.', 'loc'));
    }

    if (lastmod && !isValidLastmod(lastmod)) {
      issues.push(createIssue(
        'warning',
        '<lastmod> must be a valid ISO 8601 date or date-time.',
        'lastmod',
      ));
    }

    if (report.sitemapType === 'urlset' && changefreq
      && !CHANGE_FREQUENCIES.has(changefreq)) {
      issues.push(createIssue(
        'warning',
        '<changefreq> is not a supported sitemap value.',
        'changefreq',
      ));
    }

    if (report.sitemapType === 'urlset' && priority) {
      const numericPriority = Number(priority);
      if (!/^(?:0|1)(?:\.\d+)?$/.test(priority) || !Number.isFinite(numericPriority)
        || numericPriority < 0 || numericPriority > 1) {
        issues.push(createIssue(
          'warning',
          '<priority> must be a number between 0.0 and 1.0.',
          'priority',
        ));
      }
    }

    if (loc && locations.has(loc)) {
      issues.push(createIssue(
        'warning',
        `Duplicate URL; first seen in entry ${locations.get(loc) + 1}.`,
        'loc',
      ));
    } else if (loc) {
      locations.set(loc, index);
    }

    const entry = {
      index: index + 1,
      type: entryTag,
      loc,
      lastmod,
      changefreq,
      priority,
      extensions,
      issues,
      isValid: !issues.some((issue) => issue.severity === 'error'),
    };
    report.entries.push(entry);
    issues.forEach((issue) => report[`${issue.severity}s`].push({ ...issue, entry: index + 1 }));
  });

  report.entryCount = report.entries.length;
  report.validUrlCount = report.entries.filter((entry) => entry.isValid).length;
  if (report.entryCount > MAX_SITEMAP_ENTRIES) {
    report.errors.push(createIssue(
      'error',
      `A sitemap may contain at most ${MAX_SITEMAP_ENTRIES.toLocaleString()} entries.`,
    ));
  }
  if (report.entryCount === 0) {
    report.warnings.push(createIssue('warning', `No <${entryTag}> entries were found.`));
  }
  report.isValid = report.errors.length === 0;
  return report;
}

/**
 * Returns a small standards-compliant URL sitemap for the UI sample action.
 *
 * @returns {string} Sample URL sitemap XML.
 */
export function createUrlsetSample() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2026-11-03</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://example.com/docs?ref=sitemap&amp;page=1</loc>
    <lastmod>2026-10-27T14:30:00Z</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>`;
}

/**
 * Returns a standards-compliant sitemap index for the UI sample action.
 *
 * @returns {string} Sample sitemap index XML.
 */
export function createSitemapIndexSample() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemaps/pages.xml</loc>
    <lastmod>2026-11-03</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://example.com/sitemaps/articles.xml</loc>
    <lastmod>2026-10-31</lastmod>
  </sitemap>
</sitemapindex>`;
}
