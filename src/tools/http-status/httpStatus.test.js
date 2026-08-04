import { describe, expect, it } from 'vitest';
import {
  filterHttpStatusesByClass,
  getFilteredHttpStatuses,
  HTTP_STATUS_CODES,
  searchHttpStatuses,
} from './httpStatus.utils.js';

describe('HTTP_STATUS_CODES', () => {
  it('contains sorted standard codes across every status class', () => {
    expect(HTTP_STATUS_CODES.length).toBeGreaterThan(50);
    expect(new Set(HTTP_STATUS_CODES.map(({ code }) => Math.floor(code / 100))))
      .toEqual(new Set([1, 2, 3, 4, 5]));
    expect(HTTP_STATUS_CODES.find(({ code }) => code === 404)).toMatchObject({
      reason: 'Not Found',
    });
  });
});

describe('searchHttpStatuses', () => {
  it('matches exact and partial code queries', () => {
    expect(searchHttpStatuses('404').map(({ code }) => code)).toEqual([404]);
    expect(searchHttpStatuses('40').map(({ code }) => code)).toContain(400);
    expect(searchHttpStatuses('40').map(({ code }) => code)).toContain(404);
  });

  it('matches reason phrases and descriptions case-insensitively', () => {
    expect(searchHttpStatuses('not found').map(({ code }) => code)).toEqual([404]);
    expect(searchHttpStatuses('AUTHENTICATION').map(({ code }) => code)).toContain(401);
  });

  it('returns all statuses for an empty query and none for an unknown query', () => {
    expect(searchHttpStatuses('')).toEqual(HTTP_STATUS_CODES);
    expect(searchHttpStatuses('not-a-status')).toEqual([]);
  });
});

describe('filterHttpStatusesByClass', () => {
  it('filters statuses by class and preserves all statuses for all', () => {
    expect(filterHttpStatusesByClass('2xx').every(({ code }) => code >= 200 && code < 300))
      .toBe(true);
    expect(filterHttpStatusesByClass('all')).toEqual(HTTP_STATUS_CODES);
  });

  it('applies text and class filters with intersection semantics', () => {
    expect(getFilteredHttpStatuses('not found', '4xx').map(({ code }) => code)).toEqual([404]);
    expect(getFilteredHttpStatuses('not found', '5xx')).toEqual([]);
  });
});
