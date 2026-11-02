import { describe, expect, it } from 'vitest';
import {
  generateReleaseNotes,
  isValidReleaseDate,
  isValidSemVer,
  parseAndValidateChangelog,
} from './changelogParser.utils.js';

const VALID_CHANGELOG = `# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Dashboard filtering

## [2.0.0] - 2026-10-25 [YANKED]

### Added
- Import support

### Fixed
- Calendar edge case

## [1.0.0] - 2026-10-20

### Security
- Updated a dependency

[Unreleased]: https://example.com/compare/v2.0.0...HEAD
[2.0.0]: https://example.com/compare/v1.0.0...v2.0.0
[1.0.0]: https://example.com/releases/tag/v1.0.0`;

describe('parseAndValidateChangelog', () => {
  it('parses title, description, releases, yanked flags, categories, and links', () => {
    const parsed = parseAndValidateChangelog(VALID_CHANGELOG);

    expect(parsed.title).toBe('Changelog');
    expect(parsed.description).toContain('All notable changes');
    expect(parsed.releases).toHaveLength(3);
    expect(parsed.releases[1]).toMatchObject({
      version: '2.0.0',
      date: '2026-10-25',
      yanked: true,
      link: 'https://example.com/compare/v1.0.0...v2.0.0',
    });
    expect(parsed.releases[1].categories[0].items).toEqual(['Import support']);
    expect(parsed.errors).toEqual([]);
    expect(parsed.warnings).toEqual([]);
  });

  it('reports malformed release dates and invalid SemVer versions', () => {
    const parsed = parseAndValidateChangelog(
      '## [one.two.three] - 2026-02-30\n\n### Added\n- Item'
    );

    expect(parsed.errors).toEqual(
      expect.arrayContaining([
        'Release one.two.three has an invalid SemVer version.',
        'Release one.two.three has an invalid release date.',
      ])
    );
  });

  it('warns when dated releases are not in newest-first chronological order', () => {
    const parsed = parseAndValidateChangelog(`## [1.0.0] - 2026-01-01

### Added
- First

## [0.9.0] - 2026-02-01

### Fixed
- Later by mistake`);

    expect(parsed.warnings).toContain(
      'Release 0.9.0 is newer than the release above it; release dates should be newest first.'
    );
  });

  it('warns about missing comparison links, non-standard categories, and empty sections', () => {
    const parsed = parseAndValidateChangelog(`## [1.0.0] - 2026-01-01

### Notes

### Added
- Ready`);

    expect(parsed.warnings).toEqual(
      expect.arrayContaining([
        'Release 1.0.0 has no matching reference link definition.',
        'Release 1.0.0 uses the non-standard category "Notes".',
        'Release 1.0.0 has an empty Notes section.',
      ])
    );
  });

  it('handles an empty changelog with an actionable error', () => {
    expect(parseAndValidateChangelog('').errors).toContain(
      'No release headers were found. Use headings such as ## [1.2.3] - 2026-10-25.'
    );
  });

  it('flags release headings that do not follow the bracketed version format', () => {
    const parsed = parseAndValidateChangelog('## Version 1.0.0\n\n### Added\n- Item');

    expect(parsed.errors).toContain(
      'Non-standard release heading "Version 1.0.0" on line 1. Use ## [1.2.3] - YYYY-MM-DD.'
    );
  });
});

describe('format validation helpers', () => {
  it('accepts SemVer prerelease and build forms but rejects prefixes', () => {
    expect(isValidSemVer('1.2.3-beta.1+build.9')).toBe(true);
    expect(isValidSemVer('v1.2.3')).toBe(false);
    expect(isValidSemVer('1.2.3-01')).toBe(false);
  });

  it('checks real calendar dates', () => {
    expect(isValidReleaseDate('2024-02-29')).toBe(true);
    expect(isValidReleaseDate('2025-02-29')).toBe(false);
  });
});

describe('generateReleaseNotes', () => {
  it('generates a Markdown release note snippet', () => {
    const parsed = parseAndValidateChangelog(VALID_CHANGELOG);
    expect(generateReleaseNotes(parsed.releases[1])).toContain('## 2.0.0 - 2026-10-25 [YANKED]');
    expect(generateReleaseNotes(parsed.releases[1])).toContain('### Fixed');
  });
});
