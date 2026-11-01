export const STANDARD_CATEGORIES = [
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security',
];

const SEMVER_PATTERN = new RegExp(
  '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)' +
    '(?:-(?:0|[1-9]\\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)' +
      '(?:\\.(?:0|[1-9]\\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?' +
    '(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$'
);
const RELEASE_HEADER_PATTERN =
  /^##\s+\[([^\]]+)\](?:\s+-\s+([^\s]+))?(?:\s+\[YANKED\])?\s*$/i;
const REFERENCE_PATTERN = /^\[([^\]]+)\]:\s*(\S+)(?:\s+.*)?$/;

/**
 * Returns true when a value is a valid SemVer 2.0.0 version.
 * @param {string} version
 * @returns {boolean}
 */
export function isValidSemVer(version) {
  return SEMVER_PATTERN.test(version);
}

/**
 * Returns true when a date uses YYYY-MM-DD and names a real calendar date.
 * @param {string} date
 * @returns {boolean}
 */
export function isValidReleaseDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * Parses Keep a Changelog-flavoured Markdown into a structured changelog.
 * @param {string} markdown
 * @returns {{title: string, description: string, releases: Array, references: Object,
 * invalidHeadings: Array}}
 */
export function parseChangelog(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const references = {};
  const releases = [];
  const invalidHeadings = [];
  let title = '';
  let currentRelease = null;
  let currentCategory = null;
  let firstReleaseLine = lines.length;

  lines.forEach((line, index) => {
    const reference = line.match(REFERENCE_PATTERN);
    if (reference) {
      references[reference[1]] = reference[2];
      return;
    }

    const releaseHeader = line.match(RELEASE_HEADER_PATTERN);
    if (releaseHeader) {
      if (firstReleaseLine === lines.length) firstReleaseLine = index;
      const version = releaseHeader[1].trim();
      currentRelease = {
        version,
        date: releaseHeader[2] ?? '',
        yanked: /\[YANKED\]\s*$/i.test(line),
        categories: [],
        link: '',
        line: index + 1,
      };
      releases.push(currentRelease);
      currentCategory = null;
      return;
    }

    if (!title && /^#\s+/.test(line)) {
      title = line.replace(/^#\s+/, '').trim();
      return;
    }

    if (/^##\s+/.test(line)) {
      invalidHeadings.push({
        title: line.replace(/^##\s+/, '').trim(),
        line: index + 1,
      });
      currentCategory = null;
      return;
    }

    if (!currentRelease) return;
    const categoryHeader = line.match(/^###\s+(.+?)\s*$/);
    if (categoryHeader) {
      currentCategory = {
        name: categoryHeader[1].trim(),
        items: [],
        line: index + 1,
      };
      currentRelease.categories.push(currentCategory);
      return;
    }

    const item = line.match(/^\s*[-*+]\s+(.+?)\s*$/);
    if (item && currentCategory) {
      currentCategory.items.push(item[1]);
    }
  });

  releases.forEach((release) => {
    release.link = references[release.version] ?? '';
  });

  const description = lines
    .slice(title ? lines.findIndex((line) => /^#\s+/.test(line)) + 1 : 0, firstReleaseLine)
    .filter((line) => !REFERENCE_PATTERN.test(line))
    .join('\n')
    .trim();

  return { title, description, releases, references, invalidHeadings };
}

/**
 * Validates a parsed changelog and returns accessible errors and warnings.
 * @param {{releases: Array, references: Object, invalidHeadings?: Array}} changelog
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateChangelog(changelog) {
  const errors = [];
  const warnings = [];
  const releases = changelog.releases ?? [];

  (changelog.invalidHeadings ?? []).forEach((heading) => {
    errors.push(
      `Non-standard release heading "${heading.title}" on line ${heading.line}. ` +
        'Use ## [1.2.3] - YYYY-MM-DD.'
    );
  });

  if (releases.length === 0) {
    errors.push(
      'No release headers were found. Use headings such as ## [1.2.3] - 2026-10-25.'
    );
  }

  releases.forEach((release, index) => {
    const releaseLabel = `Release ${release.version || `on line ${release.line}`}`;
    if (release.version !== 'Unreleased' && !isValidSemVer(release.version)) {
      errors.push(`${releaseLabel} has an invalid SemVer version.`);
    }
    if (release.version !== 'Unreleased' && !release.date) {
      errors.push(`${releaseLabel} is missing a release date.`);
    }
    if (release.date && !isValidReleaseDate(release.date)) {
      errors.push(`${releaseLabel} has an invalid release date.`);
    }
    if (!release.link) {
      warnings.push(`${releaseLabel} has no matching reference link definition.`);
    }
    if (index > 0 && release.date && releases[index - 1].date) {
      if (release.date > releases[index - 1].date) {
        warnings.push(
          `${releaseLabel} is newer than the release above it; ` +
            'release dates should be newest first.'
        );
      }
    }
    release.categories.forEach((category) => {
      if (!STANDARD_CATEGORIES.includes(category.name)) {
        warnings.push(
          `Release ${release.version} uses the non-standard category "${category.name}".`
        );
      }
      if (category.items.length === 0) {
        warnings.push(`Release ${release.version} has an empty ${category.name} section.`);
      }
    });
  });

  return { errors, warnings };
}

/**
 * Parses Markdown and validates the resulting changelog structure.
 * @param {string} markdown
 * @returns {{title: string, description: string, releases: Array, references: Object,
 * invalidHeadings: Array, errors: string[], warnings: string[]}}
 */
export function parseAndValidateChangelog(markdown) {
  const changelog = parseChangelog(markdown);
  return { ...changelog, ...validateChangelog(changelog) };
}

/**
 * Generates a Markdown or plain-text release-notes snippet for one release.
 * @param {{version: string, date: string, yanked: boolean, categories: Array}} release
 * @param {'markdown'|'text'} format
 * @returns {string}
 */
export function generateReleaseNotes(release, format = 'markdown') {
  if (!release) return '';
  const suffix = release.yanked ? ' [YANKED]' : '';
  const heading = `${release.version}${release.date ? ` - ${release.date}` : ''}${suffix}`;
  const lines = [format === 'markdown' ? `## ${heading}` : heading, ''];

  release.categories.forEach((category) => {
    if (format === 'markdown') lines.push(`### ${category.name}`);
    else lines.push(category.name.toUpperCase());
    category.items.forEach((item) => lines.push(`- ${item}`));
    lines.push('');
  });

  return lines.join('\n').trim();
}
