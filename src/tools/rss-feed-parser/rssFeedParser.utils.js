const RSS_DATE_PATTERN = new RegExp(
  [
    '^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\\s+\\d{1,2}\\s+',
    '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+\\d{4}\\s+',
    '\\d{2}:\\d{2}(?::\\d{2})?\\s+(?:[+-]\\d{4}|[A-Z]{2,5})$',
  ].join(''),
  'i'
);
const RFC_3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const ATOM_NAMESPACE = 'http://www.w3.org/2005/Atom';

function childrenNamed(element, name) {
  return Array.from(element?.children ?? []).filter((child) => child.localName === name);
}

function childNamed(element, name) {
  return childrenNamed(element, name)[0] ?? null;
}

function textFrom(element, name) {
  return childNamed(element, name)?.textContent?.trim() ?? '';
}

function atomLink(element) {
  const links = childrenNamed(element, 'link');
  const alternate = links.find(
    (link) => !link.getAttribute('rel') || link.getAttribute('rel') === 'alternate'
  );
  return (alternate ?? links[0])?.getAttribute('href')?.trim() ?? '';
}

function addRequiredTextErrors(element, names, context, errors) {
  names.forEach((name) => {
    if (!textFrom(element, name)) {
      errors.push(`${context} is missing required <${name}>.`);
    }
  });
}

function addLinkError(value, context, errors, required = false) {
  if (!value) {
    if (required) errors.push(`${context} is missing a required link.`);
    return;
  }
  if (!isValidLinkUrl(value)) {
    errors.push(`${context} has an invalid link URL: ${value}`);
  }
}

function parseRss(root, errors) {
  if (root.getAttribute('version') !== '2.0') {
    errors.push('RSS <rss> must declare version="2.0".');
  }
  const channel = childNamed(root, 'channel');
  if (!channel) {
    errors.push('RSS <rss> is missing required <channel>.');
    return null;
  }

  addRequiredTextErrors(channel, ['title', 'link', 'description'], 'RSS <channel>', errors);
  const link = textFrom(channel, 'link');
  addLinkError(link, 'RSS <channel>', errors, true);
  const dateElement = childNamed(channel, 'pubDate') ?? childNamed(channel, 'lastBuildDate');
  const pubDate = dateElement?.textContent?.trim() ?? '';
  if (pubDate && !isValidRssDate(pubDate)) {
    errors.push(
      `RSS <channel> has an invalid RFC 822 date in <${dateElement.localName}>: ${pubDate}`
    );
  }

  const entries = childrenNamed(channel, 'item').map((item, index) => {
    const itemLink = textFrom(item, 'link');
    const itemDate = textFrom(item, 'pubDate');
    if (itemDate && !isValidRssDate(itemDate)) {
      errors.push(
        `RSS <item ${index + 1}> has an invalid RFC 822 date in <pubDate>: ${itemDate}`
      );
    }
    addLinkError(itemLink, `RSS <item ${index + 1}>`, errors);
    return {
      title: textFrom(item, 'title'),
      link: itemLink,
      date: itemDate,
      author: textFrom(item, 'author') || textFrom(item, 'creator'),
      summary: textFrom(item, 'description') || textFrom(item, 'encoded'),
    };
  });

  return {
    format: 'RSS 2.0',
    title: textFrom(channel, 'title'),
    link,
    description: textFrom(channel, 'description'),
    updated: pubDate,
    entries,
  };
}

function parseAtom(root, errors) {
  if (root.namespaceURI !== ATOM_NAMESPACE) {
    errors.push(`Atom <feed> must use the ${ATOM_NAMESPACE} namespace.`);
  }
  addRequiredTextErrors(root, ['id', 'title', 'updated'], 'Atom <feed>', errors);
  const link = atomLink(root);
  addLinkError(link, 'Atom <feed>', errors);
  const updated = textFrom(root, 'updated');
  if (updated && !isValidAtomDate(updated)) {
    errors.push(`Atom <feed> has an invalid RFC 3339 date in <updated>: ${updated}`);
  }

  const entries = childrenNamed(root, 'entry').map((entry, index) => {
    const entryLink = atomLink(entry);
    const published = textFrom(entry, 'published');
    const entryUpdated = textFrom(entry, 'updated');
    if (published && !isValidAtomDate(published)) {
      errors.push(
        `Atom <entry ${index + 1}> has an invalid RFC 3339 date in <published>: ${published}`
      );
    }
    if (entryUpdated && !isValidAtomDate(entryUpdated)) {
      errors.push(
        `Atom <entry ${index + 1}> has an invalid RFC 3339 date in <updated>: ${entryUpdated}`
      );
    }
    addLinkError(entryLink, `Atom <entry ${index + 1}>`, errors);
    return {
      title: textFrom(entry, 'title'),
      link: entryLink,
      date: published || entryUpdated,
      author: textFrom(childNamed(entry, 'author'), 'name'),
      summary: textFrom(entry, 'summary') || textFrom(entry, 'content'),
    };
  });

  return {
    format: 'Atom 1.0',
    title: textFrom(root, 'title'),
    link,
    description: textFrom(root, 'subtitle'),
    updated,
    entries,
  };
}

/**
 * Checks whether a URL is an absolute HTTP(S) URL suitable for a feed link.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidLinkUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Checks whether a date uses a parseable RFC 822 date form.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidRssDate(value) {
  return RSS_DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * Checks whether a date uses a valid RFC 3339 timestamp form.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidAtomDate(value) {
  if (!RFC_3339_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    return false;
  }
  const [, year, month, day, hour, minute, second = '00'] =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value) ?? [];
  if (!year) return false;
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return (
    Number(month) >= 1 &&
    Number(month) <= 12 &&
    Number(day) >= 1 &&
    Number(day) <= daysInMonth &&
    Number(hour) <= 23 &&
    Number(minute) <= 59 &&
    Number(second) <= 59
  );
}

/**
 * Parses RSS 2.0 or Atom 1.0 XML and returns extracted feed data plus validation errors.
 * @param {string} xmlText
 * @returns {{feed: object|null, errors: string[]}}
 */
export function parseFeedXml(xmlText) {
  if (typeof xmlText !== 'string' || !xmlText.trim()) {
    return { feed: null, errors: ['Paste RSS or Atom XML to parse it.'] };
  }

  const document = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (document.querySelector('parsererror')) {
    return { feed: null, errors: ['XML is not well-formed.'] };
  }

  const root = document.documentElement;
  const errors = [];
  if (root.localName === 'rss') {
    return { feed: parseRss(root, errors), errors };
  }
  if (root.localName === 'feed') {
    return { feed: parseAtom(root, errors), errors };
  }
  return { feed: null, errors: ['Expected an RSS <rss> or Atom <feed> root element.'] };
}

/**
 * Reads a feed file as text.
 * @param {File|Blob} file
 * @returns {Promise<string>}
 */
export function readFeedFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read the selected feed file.'));
    reader.readAsText(file);
  });
}
