import { describe, expect, it } from 'vitest';
import {
  filterEntries,
  formatBytes,
  formatDuration,
  getOverview,
  parseHar,
} from './har.utils.js';

const sampleHar = {
  log: {
    entries: [
      {
        startedDateTime: '2026-09-04T00:00:00.000Z',
        time: 70,
        request: { method: 'GET', url: 'https://example.test/app.js' },
        response: {
          status: 200,
          bodySize: 2048,
          content: { mimeType: 'application/javascript' },
        },
        timings: { blocked: 5, dns: 10, connect: 15, send: 5, wait: 25, receive: 10 },
      },
      {
        startedDateTime: '2026-09-04T00:00:00.100Z',
        time: 30,
        _resourceType: 'fetch',
        request: { method: 'POST', url: 'https://api.example.test/items' },
        response: { status: 404, _transferSize: 12000, content: { mimeType: 'application/json' } },
        timings: { wait: 20, receive: 10 },
      },
    ],
  },
};

describe('parseHar', () => {
  it('normalizes optional fields and derives request display values', () => {
    const { entries } = parseHar(JSON.stringify(sampleHar));

    expect(entries).toHaveLength(2);
    expect(entries[0].resourceType).toBe('JS');
    expect(entries[1].resourceType).toBe('XHR/Fetch');
    expect(entries[1].request.headers).toEqual([]);
    expect(entries[1].timings.dns).toBe(0);
  });

  it('reports friendly errors for blank, malformed, and non-HAR input', () => {
    expect(() => parseHar('')).toThrow('Paste HAR JSON');
    expect(() => parseHar('{oops')).toThrow('not valid JSON');
    expect(() => parseHar('{"entries": []}')).toThrow('Expected a log.entries array');
  });

  it('handles entries with missing timing metrics and invalid dates', () => {
    const { entries } = parseHar(JSON.stringify({ log: { entries: [null] } }));

    expect(entries[0].duration).toBe(0);
    expect(entries[0].startedAt).toBe(0);
    expect(entries[0].resourceType).toBe('Other');
  });
});

describe('HAR overview and filters', () => {
  const entries = parseHar(JSON.stringify(sampleHar)).entries;

  it('calculates transfer, page span, statuses, and response size bins', () => {
    const overview = getOverview(entries);

    expect(overview).toMatchObject({ totalRequests: 2, totalTransferSize: 14048, totalLoadTime: 130 });
    expect(overview.statusCounts).toMatchObject({ '2xx': 1, '4xx': 1 });
    expect(overview.sizeDistribution.map((bin) => bin.count)).toEqual([1, 1, 0, 0]);
  });

  it('filters requests by URL, method, status range, and resource type together', () => {
    expect(filterEntries(entries, { url: 'api.', method: 'POST', status: '400', resourceType: 'XHR/Fetch' }))
      .toEqual([entries[1]]);
    expect(filterEntries(entries, { url: '', method: '', status: '200', resourceType: 'JS' }))
      .toEqual([entries[0]]);
    expect(filterEntries(entries, { url: '', method: '', status: '500', resourceType: '' }))
      .toEqual([]);
  });

  it('formats compact display values', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatDuration(1250)).toBe('1.25 s');
  });
});
