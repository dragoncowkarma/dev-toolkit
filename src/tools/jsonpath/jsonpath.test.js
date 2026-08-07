import { describe, expect, it } from 'vitest';
import {
  evaluateJsonPath,
  evaluateJsonPathInput,
  JsonPathSyntaxError,
  parseJsonInput,
  parseJsonPath,
} from './jsonpath.utils.js';

const CATALOG = {
  store: {
    book: [
      { author: 'Nigel Rees', title: 'Sayings', price: 8.95, archived: false },
      { author: 'Evelyn Waugh', title: 'Sword', price: 12.99, archived: true },
      { author: 'Herman Melville', title: 'Moby Dick', price: 8.99 },
    ],
    bicycle: { color: 'red', price: 19.95 },
  },
  items: [
    { name: 'Lamp', 'in-stock': true, tags: ['sale'] },
    { name: 'Desk', 'in-stock': false, tags: ['office'] },
  ],
};

describe('JSONPath parsing and evaluation', () => {
  it('evaluates dot, bracket, and wildcard selectors in document order', () => {
    expect(evaluateJsonPath(CATALOG, '$.store.book[*].author')).toEqual([
      'Nigel Rees',
      'Evelyn Waugh',
      'Herman Melville',
    ]);
    expect(evaluateJsonPath(CATALOG, "$['store']['book'][0]['title']")).toEqual(['Sayings']);
  });

  it('supports positive, negative, and stepped array slices', () => {
    expect(evaluateJsonPath(CATALOG, '$.store.book[0:3:2].title')).toEqual([
      'Sayings',
      'Moby Dick',
    ]);
    expect(evaluateJsonPath(CATALOG, '$.store.book[-1].author')).toEqual(['Herman Melville']);
    expect(evaluateJsonPath(CATALOG, '$.store.book[::-1].author')).toEqual([
      'Herman Melville',
      'Evelyn Waugh',
      'Nigel Rees',
    ]);
  });

  it('recursively selects matching properties', () => {
    expect(evaluateJsonPath(CATALOG, '$..price')).toEqual([8.95, 12.99, 8.99, 19.95]);
  });

  it('evaluates safe filter expressions with dot and bracket property access', () => {
    expect(
      evaluateJsonPath(CATALOG, '$.store.book[?(@.price < 10 && !@.archived)].author'),
    ).toEqual(['Nigel Rees', 'Herman Melville']);
    expect(evaluateJsonPath(CATALOG, "$.items[?(@['in-stock'] == true)].name")).toEqual(['Lamp']);
    expect(evaluateJsonPath(CATALOG, "$.items[?(@.tags[0] == 'sale')].name")).toEqual(['Lamp']);
  });

  it('returns an empty array for valid paths without matches', () => {
    expect(evaluateJsonPath(CATALOG, '$.store.book[*].publisher')).toEqual([]);
  });

  it('rejects malformed expressions and invalid slice steps', () => {
    expect(() => parseJsonPath('$..')).toThrow(JsonPathSyntaxError);
    expect(() => evaluateJsonPath(CATALOG, '$.store.book[1:3:0]')).toThrow(JsonPathSyntaxError);
    expect(() => evaluateJsonPath(CATALOG, '$.items[?(@.name ==)]')).toThrow(JsonPathSyntaxError);
  });
});

describe('safe JSONPath input evaluation', () => {
  it('parses valid falsy JSON values without confusing them with a parse failure', () => {
    expect(parseJsonInput('false')).toEqual({ ok: true, value: false, error: '' });
    expect(evaluateJsonPathInput('false', '$')).toMatchObject({
      matches: [false],
      count: 1,
      output: '[\n  false\n]',
      error: '',
      ready: true,
    });
  });

  it('returns renderable errors instead of propagating JSON or path exceptions', () => {
    expect(evaluateJsonPathInput('{"item": }', '$.item').error).toMatch(/^Invalid JSON:/);
    expect(evaluateJsonPathInput('{"item": 1}', '$.item[').error).toMatch(/^Invalid JSONPath:/);
  });

  it('does not treat a blank expression as an error before evaluation begins', () => {
    expect(evaluateJsonPathInput('{"item": 1}', '')).toEqual({
      matches: [],
      count: 0,
      output: '',
      error: '',
      ready: false,
    });
  });
});
