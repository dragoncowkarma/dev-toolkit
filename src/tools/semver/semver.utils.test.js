import { describe, expect, it } from 'vitest';
import {
  bumpSemver,
  compareSemver,
  diffSemver,
  parseRange,
  parseSemver,
  satisfiesRange,
} from './semver.utils.js';

describe('semver.utils', () => {
  describe('parseSemver', () => {
    it('parses valid semver strings with optional v prefix', () => {
      expect(parseSemver('1.10.0')).toEqual({
        major: 1,
        minor: 10,
        patch: 0,
        prerelease: [],
        build: [],
        raw: '1.10.0',
      });

      expect(parseSemver('v1.9.0')).toEqual({
        major: 1,
        minor: 9,
        patch: 0,
        prerelease: [],
        build: [],
        raw: 'v1.9.0',
      });

      expect(parseSemver('V2.3.4-alpha.1+sha.123')).toEqual({
        major: 2,
        minor: 3,
        patch: 4,
        prerelease: ['alpha', 1],
        build: ['sha', '123'],
        raw: 'V2.3.4-alpha.1+sha.123',
      });
    });

    it('returns null for invalid semver inputs', () => {
      expect(parseSemver('1.2')).toBeNull();
      expect(parseSemver('1.01.0')).toBeNull();
      expect(parseSemver('1.2.3-')).toBeNull();
      expect(parseSemver('1.2.3-01')).toBeNull();
      expect(parseSemver('abc')).toBeNull();
      expect(parseSemver('')).toBeNull();
      expect(parseSemver(null)).toBeNull();
    });
  });

  describe('compareSemver', () => {
    it('handles numeric version ordering correctly', () => {
      expect(compareSemver('1.10.0', '1.9.0')).toBe(1);
      expect(compareSemver('1.9.0', '1.10.0')).toBe(-1);
      expect(compareSemver('2.0.0', '2.0.0')).toBe(0);
    });

    it('ranks prerelease lower than release version', () => {
      expect(compareSemver('1.0.0-alpha', '1.0.0')).toBe(-1);
      expect(compareSemver('1.0.0', '1.0.0-alpha')).toBe(1);
    });

    it('orders prerelease identifiers per SemVer 2.0.0 §11 precedence', () => {
      const versions = [
        '1.0.0-alpha',
        '1.0.0-alpha.1',
        '1.0.0-alpha.beta',
        '1.0.0-beta.2',
        '1.0.0-beta.11',
        '1.0.0-rc.1',
      ];

      for (let i = 0; i < versions.length - 1; i += 1) {
        expect(compareSemver(versions[i], versions[i + 1])).toBe(-1);
        expect(compareSemver(versions[i + 1], versions[i])).toBe(1);
      }
    });

    it('ignores build metadata during comparison', () => {
      expect(compareSemver('1.2.3+build.1', '1.2.3+build.2')).toBe(0);
      expect(compareSemver('1.2.3+build.1', '1.2.3')).toBe(0);
    });

    it('returns null when comparing invalid versions', () => {
      expect(compareSemver('invalid', '1.0.0')).toBeNull();
      expect(compareSemver('1.0.0', '1.01.0')).toBeNull();
    });
  });

  describe('diffSemver', () => {
    it('identifies each release level difference', () => {
      expect(diffSemver('1.0.0', '2.0.0')).toBe('major');
      expect(diffSemver('1.1.0', '1.2.0')).toBe('minor');
      expect(diffSemver('1.0.0', '1.0.1')).toBe('patch');
      expect(diffSemver('1.0.0-alpha', '1.0.0-beta')).toBe('prerelease');
      expect(diffSemver('1.0.0+build1', '1.0.0+build2')).toBe('build');
      expect(diffSemver('1.0.0+build1', '1.0.0+build1')).toBeNull();
    });

    it('returns null for invalid version inputs', () => {
      expect(diffSemver('invalid', '1.0.0')).toBeNull();
    });
  });

  describe('bumpSemver', () => {
    it('bumps major, minor, patch, and prerelease correctly', () => {
      expect(bumpSemver('1.2.3', 'major')).toBe('2.0.0');
      expect(bumpSemver('1.2.3-alpha.1+build', 'major')).toBe('2.0.0');
      expect(bumpSemver('1.2.3', 'minor')).toBe('1.3.0');
      expect(bumpSemver('1.2.3', 'patch')).toBe('1.2.4');
      expect(bumpSemver('1.2.3-alpha.1', 'patch')).toBe('1.2.3');
      expect(bumpSemver('1.2.3', 'prerelease')).toBe('1.2.4-0');
      expect(bumpSemver('1.2.3-alpha', 'prerelease')).toBe('1.2.3-alpha.0');
      expect(bumpSemver('1.2.3-alpha.0', 'prerelease')).toBe('1.2.3-alpha.1');
      expect(bumpSemver('1.2.3-0', 'prerelease')).toBe('1.2.3-1');
    });

    it('returns null for invalid inputs or unknown release types', () => {
      expect(bumpSemver('invalid', 'major')).toBeNull();
      expect(bumpSemver('1.2.3', 'unknown')).toBeNull();
    });
  });

  describe('parseRange & satisfiesRange', () => {
    it('supports caret ^ range matching including subtleties', () => {
      expect(satisfiesRange('1.2.3', '^1.2.0')).toBe(true);
      expect(satisfiesRange('1.9.9', '^1.2.0')).toBe(true);
      expect(satisfiesRange('2.0.0', '^1.2.0')).toBe(false);
      expect(satisfiesRange('0.2.3', '^0.2.3')).toBe(true);
      expect(satisfiesRange('0.2.9', '^0.2.3')).toBe(true);
      expect(satisfiesRange('0.3.0', '^0.2.3')).toBe(false);
      expect(satisfiesRange('0.0.3', '^0.0.3')).toBe(true);
      expect(satisfiesRange('0.0.4', '^0.0.3')).toBe(false);
    });

    it('supports tilde ~ range matching', () => {
      expect(satisfiesRange('1.2.3', '~1.2.0')).toBe(true);
      expect(satisfiesRange('1.2.9', '~1.2.0')).toBe(true);
      expect(satisfiesRange('1.3.0', '~1.2.0')).toBe(false);
    });

    it('supports primitive >= and < comparators', () => {
      expect(satisfiesRange('1.5.0', '>=1.2.0 <2.0.0')).toBe(true);
      expect(satisfiesRange('2.0.0', '>=1.2.0 <2.0.0')).toBe(false);
    });

    it('supports x-wildcards', () => {
      expect(satisfiesRange('1.2.9', '1.2.x')).toBe(true);
      expect(satisfiesRange('1.3.0', '1.2.x')).toBe(false);
      expect(satisfiesRange('1.8.0', '1.X')).toBe(true);
      expect(satisfiesRange('2.0.0', '1.X')).toBe(false);
    });

    it('supports hyphen ranges', () => {
      expect(satisfiesRange('1.5.0', '1.2.3 - 2.3.4')).toBe(true);
      expect(satisfiesRange('2.3.4', '1.2.3 - 2.3.4')).toBe(true);
      expect(satisfiesRange('2.3.5', '1.2.3 - 2.3.4')).toBe(false);
    });

    it('supports || OR expressions', () => {
      expect(satisfiesRange('1.2.5', '^1.2.0 || ^2.0.0')).toBe(true);
      expect(satisfiesRange('2.1.0', '^1.2.0 || ^2.0.0')).toBe(true);
      expect(satisfiesRange('3.0.0', '^1.2.0 || ^2.0.0')).toBe(false);
    });

    it('supports caret ^ and tilde ~ ranges with build metadata', () => {
      expect(parseRange('^1.2.3+build.5')).not.toBeNull();
      expect(parseRange('~1.2.3+build.5')).not.toBeNull();
      expect(satisfiesRange('1.2.3', '^1.2.3+build.5')).toBe(true);
      expect(satisfiesRange('1.9.0', '^1.2.3+build.5')).toBe(true);
      expect(satisfiesRange('2.0.0', '^1.2.3+build.5')).toBe(false);
      expect(satisfiesRange('1.2.3', '~1.2.3+build.5')).toBe(true);
      expect(satisfiesRange('1.2.9', '~1.2.3+build.5')).toBe(true);
      expect(satisfiesRange('1.3.0', '~1.2.3+build.5')).toBe(false);
    });

    it('supports hyphen ranges combined with partial wildcard endpoints', () => {
      expect(parseRange('1.2.3 - 2.x')).not.toBeNull();
      expect(parseRange('1.x - 2.3.4')).not.toBeNull();
      expect(parseRange('1.2.x - 2.3.x')).not.toBeNull();

      expect(satisfiesRange('1.2.3', '1.2.3 - 2.x')).toBe(true);
      expect(satisfiesRange('2.9.9', '1.2.3 - 2.x')).toBe(true);
      expect(satisfiesRange('3.0.0', '1.2.3 - 2.x')).toBe(false);
      expect(satisfiesRange('1.2.2', '1.2.3 - 2.x')).toBe(false);

      expect(satisfiesRange('1.0.0', '1.x - 2.3.4')).toBe(true);
      expect(satisfiesRange('2.3.4', '1.x - 2.3.4')).toBe(true);
      expect(satisfiesRange('2.3.5', '1.x - 2.3.4')).toBe(false);
      expect(satisfiesRange('0.9.9', '1.x - 2.3.4')).toBe(false);

      expect(satisfiesRange('1.2.0', '1.2.x - 2.3.x')).toBe(true);
      expect(satisfiesRange('2.3.9', '1.2.x - 2.3.x')).toBe(true);
      expect(satisfiesRange('2.4.0', '1.2.x - 2.3.x')).toBe(false);
      expect(satisfiesRange('1.1.9', '1.2.x - 2.3.x')).toBe(false);
    });

    it('returns null from parseRange for unsupported or invalid range syntax', () => {
      expect(parseRange('invalid range string')).toBeNull();
      expect(parseRange('1.2.3.4')).toBeNull();
      expect(parseRange('^1.2.3.4')).toBeNull();
      expect(parseRange('>>1.2.3')).toBeNull();
    });
  });
});
