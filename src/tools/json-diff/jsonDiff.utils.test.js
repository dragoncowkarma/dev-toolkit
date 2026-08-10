import { describe, expect, it } from 'vitest';
import { compareJsonInputs, diffJson } from './jsonDiff.utils.js';

describe('diffJson', () => {
  it('detects nested added, removed, and changed properties in path order', () => {
    expect(diffJson(
      { profile: { age: 30, legacy: true }, enabled: false },
      { profile: { age: 31, name: 'Ada' }, enabled: true },
    )).toEqual([
      { path: '$.enabled', type: 'changed', oldValue: false, newValue: true },
      { path: '$.profile.age', type: 'changed', oldValue: 30, newValue: 31 },
      { path: '$.profile.legacy', type: 'removed', oldValue: true },
      { path: '$.profile.name', type: 'added', newValue: 'Ada' },
    ]);
  });

  it('compares arrays by index, including changed, removed, and added positions', () => {
    expect(diffJson([1, { active: false }, 3], [1, { active: true }, 4, 5])).toEqual([
      { path: '$[1].active', type: 'changed', oldValue: false, newValue: true },
      { path: '$[2]', type: 'changed', oldValue: 3, newValue: 4 },
      { path: '$[3]', type: 'added', newValue: 5 },
    ]);
    expect(diffJson([1, 2], [1])).toEqual([
      { path: '$[1]', type: 'removed', oldValue: 2 },
    ]);
  });

  it('reports a type change at the same path', () => {
    expect(diffJson({ value: 1 }, { value: '1' })).toEqual([
      { path: '$.value', type: 'changed', oldValue: 1, newValue: '1' },
    ]);
  });

  it('ignores object key order and source whitespace', () => {
    const result = compareJsonInputs('{"b": 2, "a": {"x": true}}', `{
      "a": { "x": true },
      "b": 2
    }`);
    expect(result).toEqual({ ready: true, changes: [], errors: [] });
  });

  it('uses readable bracket notation for non-identifier keys', () => {
    expect(diffJson({ 'api-key': 1 }, { 'api-key': 2 })[0].path).toBe('$["api-key"]');
  });
});

describe('compareJsonInputs', () => {
  it('returns structured parse errors for both sides without throwing', () => {
    expect(compareJsonInputs('{', ']')).toMatchObject({
      ready: false,
      changes: [],
      errors: [{ side: 'original' }, { side: 'changed' }],
    });
  });

  it('waits until both inputs have content', () => {
    expect(compareJsonInputs('', '{}')).toEqual({ ready: false, changes: [], errors: [] });
  });
});
