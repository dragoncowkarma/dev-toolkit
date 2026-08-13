import { describe, it, expect } from 'vitest';
import {
  parseHar,
  calculateSummary,
  formatBytes,
  formatDuration,
  getMimeCategory,
  normalizeTimings,
  filterAndSortEntries,
  SAMPLE_HAR,
} from './har.utils.js';

describe('har.utils.js', () => {
  describe('formatBytes', () => {
    it('formats bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
    });

    it('handles negative or invalid values gracefully', () => {
      expect(formatBytes(-100)).toBe('0 B');
      expect(formatBytes(NaN)).toBe('0 B');
      expect(formatBytes(null)).toBe('0 B');
      expect(formatBytes('invalid')).toBe('0 B');
    });
  });

  describe('formatDuration', () => {
    it('formats milliseconds correctly', () => {
      expect(formatDuration(0)).toBe('0 ms');
      expect(formatDuration(45.6)).toBe('46 ms');
      expect(formatDuration(1500)).toBe('1.50 s');
      expect(formatDuration(65000)).toBe('1 m 5.0 s');
    });

    it('handles negative or invalid values gracefully', () => {
      expect(formatDuration(-10)).toBe('0 ms');
      expect(formatDuration(NaN)).toBe('0 ms');
      expect(formatDuration(undefined)).toBe('0 ms');
    });
  });

  describe('getMimeCategory', () => {
    it('classifies mime types correctly', () => {
      expect(getMimeCategory('application/json')).toBe('xhr');
      expect(getMimeCategory('text/xml')).toBe('xhr');
      expect(getMimeCategory('application/javascript')).toBe('script');
      expect(getMimeCategory('text/css')).toBe('stylesheet');
      expect(getMimeCategory('image/png')).toBe('image');
      expect(getMimeCategory('image/svg+xml')).toBe('image');
      expect(getMimeCategory('font/woff2')).toBe('font');
      expect(getMimeCategory('text/html')).toBe('document');
      expect(getMimeCategory('video/mp4')).toBe('other');
      expect(getMimeCategory(null)).toBe('other');
    });
  });

  describe('normalizeTimings', () => {
    it('normalizes valid timing numbers', () => {
      const raw = {
        blocked: 1.5,
        dns: 10,
        connect: 25,
        ssl: 15,
        send: 2,
        wait: 50,
        receive: 17,
      };
      const res = normalizeTimings(raw, 1);
      expect(res.timings).toEqual({
        blocked: 1.5,
        dns: 10,
        connect: 25,
        ssl: 15,
        send: 2,
        wait: 50,
        receive: 17,
      });
      expect(res.total).toBe(120.5);
      expect(res.warnings).toHaveLength(0);
    });

    it('converts -1 and missing timing phases to 0 without throwing', () => {
      const raw = {
        blocked: -1,
        dns: -1,
        send: 1.0,
        wait: 20.0,
      };
      const res = normalizeTimings(raw, 2);
      expect(res.timings.blocked).toBe(0);
      expect(res.timings.dns).toBe(0);
      expect(res.timings.connect).toBe(0);
      expect(res.timings.send).toBe(1.0);
      expect(res.timings.wait).toBe(20.0);
      expect(res.warnings).toHaveLength(0);
    });

    it('flags non-numeric or negative values with warnings', () => {
      const raw = {
        blocked: 'invalid',
        dns: -5,
        send: 2.0,
      };
      const res = normalizeTimings(raw, 3);
      expect(res.timings.blocked).toBe(0);
      expect(res.timings.dns).toBe(0);
      expect(res.timings.send).toBe(2.0);
      expect(res.warnings.length).toBeGreaterThanOrEqual(2);
      expect(res.warnings[0]).toContain('Non-numeric timing value');
      expect(res.warnings[1]).toContain('Negative timing value');
    });
  });

  describe('parseHar', () => {
    it('parses valid SAMPLE_HAR object successfully', () => {
      const result = parseHar(SAMPLE_HAR);
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.entries).toHaveLength(5);
      expect(result.summary.totalRequests).toBe(5);
      expect(result.summary.statusCounts['2xx']).toBe(2);
      expect(result.summary.statusCounts['3xx']).toBe(1);
      expect(result.summary.statusCounts['4xx']).toBe(1);
      expect(result.summary.statusCounts['5xx']).toBe(1);
    });

    it('parses HAR string input successfully', () => {
      const harStr = JSON.stringify(SAMPLE_HAR);
      const result = parseHar(harStr);
      expect(result.success).toBe(true);
      expect(result.entries).toHaveLength(5);
    });

    it('returns structured error for empty input', () => {
      const res1 = parseHar('');
      expect(res1.success).toBe(false);
      expect(res1.error).toContain('empty');

      const res2 = parseHar('   ');
      expect(res2.success).toBe(false);
      expect(res2.error).toContain('empty');
    });

    it('returns structured error for invalid JSON without throwing', () => {
      const res = parseHar('{ invalid json ');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Invalid JSON syntax');
      expect(res.entries).toEqual([]);
    });

    it('returns structured error for non-object root or missing log.entries', () => {
      expect(parseHar('123').error).toContain('Root must be a JSON object');
      expect(parseHar('{}').error).toContain('Missing "log" object');
      expect(parseHar('{"log": {}}').error).toContain('Missing or invalid "log.entries" array');
    });

    it('handles entries with missing/invalid startedDateTime by generating warnings', () => {
      const badHar = {
        log: {
          version: '1.2',
          entries: [
            {
              startedDateTime: 'not-a-date',
              time: 50,
              request: { method: 'GET', url: 'https://example.com' },
              response: { status: 200 },
            },
          ],
        },
      };
      const res = parseHar(badHar);
      expect(res.success).toBe(true);
      expect(res.entries).toHaveLength(1);
      expect(res.entries[0].isValidDate).toBe(false);
      expect(res.warnings).toHaveLength(1);
      expect(res.warnings[0]).toContain('Missing or invalid startedDateTime');
    });

    it('handles entries with missing request/response objects gracefully', () => {
      const minimalHar = {
        log: {
          version: '1.2',
          entries: [{}],
        },
      };
      const res = parseHar(minimalHar);
      expect(res.success).toBe(true);
      expect(res.entries).toHaveLength(1);
      expect(res.entries[0].method).toBe('GET');
      expect(res.entries[0].status).toBe(0);
      expect(res.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('calculateSummary', () => {
    it('returns empty summary for empty array', () => {
      const summary = calculateSummary([]);
      expect(summary.totalRequests).toBe(0);
      expect(summary.totalTransferredSize).toBe(0);
      expect(summary.totalWallClockTime).toBe(0);
    });

    it('calculates aggregate metrics correctly', () => {
      const res = parseHar(SAMPLE_HAR);
      const summary = calculateSummary(res.entries);
      expect(summary.totalRequests).toBe(5);
      expect(summary.totalTransferredSize).toBeGreaterThan(0);
      expect(summary.statusCounts['2xx']).toBe(2);
      expect(summary.statusCounts['3xx']).toBe(1);
      expect(summary.statusCounts['4xx']).toBe(1);
      expect(summary.statusCounts['5xx']).toBe(1);
    });
  });

  describe('filterAndSortEntries', () => {
    const parsed = parseHar(SAMPLE_HAR).entries;

    it('filters by search term', () => {
      const res = filterAndSortEntries(parsed, { search: 'users' });
      expect(res).toHaveLength(1);
      expect(res[0].url).toContain('users');
    });

    it('filters by status class', () => {
      const res2xx = filterAndSortEntries(parsed, { statusFilter: '2xx' });
      expect(res2xx).toHaveLength(2);

      const res4xx = filterAndSortEntries(parsed, { statusFilter: '4xx' });
      expect(res4xx).toHaveLength(1);

      const resErrors = filterAndSortEntries(parsed, { statusFilter: 'errors' });
      expect(resErrors).toHaveLength(2); // 404 + 500
    });

    it('filters by HTTP method', () => {
      const resPost = filterAndSortEntries(parsed, { methodFilter: 'post' });
      expect(resPost).toHaveLength(1);
      expect(resPost[0].method).toBe('POST');
    });

    it('filters by MIME category', () => {
      const resImage = filterAndSortEntries(parsed, { mimeFilter: 'image' });
      expect(resImage).toHaveLength(1);
      expect(resImage[0].mimeCategory).toBe('image');
    });

    it('sorts by different fields in asc and desc order', () => {
      const sortedByTimeAsc = filterAndSortEntries(parsed, {
        sortBy: 'time',
        sortOrder: 'asc',
      });
      expect(sortedByTimeAsc[0].time).toBeLessThanOrEqual(sortedByTimeAsc[4].time);

      const sortedByStatusDesc = filterAndSortEntries(parsed, {
        sortBy: 'status',
        sortOrder: 'desc',
      });
      expect(sortedByStatusDesc[0].status).toBeGreaterThanOrEqual(sortedByStatusDesc[4].status);
    });
  });
});
