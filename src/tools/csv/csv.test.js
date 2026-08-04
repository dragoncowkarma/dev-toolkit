import { describe, expect, it } from 'vitest';
import { csvToJson, detectDelimiter, jsonToCsv, parseCSV } from './csv.utils.js';

describe('parseCSV', () => {
  it('parses comma-containing quoted fields', () => {
    expect(parseCSV('name,note\nAda,"one, two"')).toEqual([
      ['name', 'note'],
      ['Ada', 'one, two'],
    ]);
  });

  it('unescapes double quotes inside quoted fields', () => {
    expect(parseCSV('note\n"She said ""hello"""')).toEqual([
      ['note'],
      ['She said "hello"'],
    ]);
  });

  it('preserves line breaks inside quoted fields', () => {
    expect(parseCSV('name,note\nAda,"first\nsecond"')).toEqual([
      ['name', 'note'],
      ['Ada', 'first\nsecond'],
    ]);
  });

  it('supports CRLF and does not create a trailing empty row', () => {
    expect(parseCSV('name,team\r\nAda,Platform\r\n')).toEqual([
      ['name', 'team'],
      ['Ada', 'Platform'],
    ]);
  });

  it('supports LF rows', () => {
    expect(parseCSV('name\nAda\nLin')).toEqual([['name'], ['Ada'], ['Lin']]);
  });

  it('reports an unterminated quoted field with its location', () => {
    expect(() => parseCSV('name,note\nAda,"open'))
      .toThrow('Unterminated quoted field at row 2, column 5');
  });
});

describe('csvToJson', () => {
  it('uses the first row as object headers by default', () => {
    expect(csvToJson('name,team\nAda,Platform')).toEqual([{ name: 'Ada', team: 'Platform' }]);
  });

  it('returns arrays when header mode is disabled', () => {
    expect(csvToJson('Ada,Platform\nLin,Data', { hasHeader: false })).toEqual([
      ['Ada', 'Platform'],
      ['Lin', 'Data'],
    ]);
  });

  it('reports ragged rows with a row and column', () => {
    expect(() => csvToJson('name,team\nAda'))
      .toThrow('Ragged row has 1 columns; expected 2 at row 2, column 2');
  });

  it('supports a tab delimiter', () => {
    expect(csvToJson('name\tteam\nAda\tPlatform', { delimiter: '\t' }))
      .toEqual([{ name: 'Ada', team: 'Platform' }]);
  });

  it('supports semicolon and pipe delimiters', () => {
    expect(csvToJson('name;team\nAda;Platform', { delimiter: ';' }))
      .toEqual([{ name: 'Ada', team: 'Platform' }]);
    expect(csvToJson('name|team\nLin|Data', { delimiter: '|' }))
      .toEqual([{ name: 'Lin', team: 'Data' }]);
  });

  it('detects the delimiter while ignoring quoted delimiters', () => {
    const source = 'name;note\nAda;"one, two"';
    expect(detectDelimiter(source)).toBe(';');
    expect(csvToJson(source)).toEqual([{ name: 'Ada', note: 'one, two' }]);
  });
});

describe('jsonToCsv', () => {
  it('uses the union of object keys as headers', () => {
    expect(jsonToCsv('[{"name":"Ada"},{"team":"Data","name":"Lin"}]'))
      .toBe('name,team\r\nAda,\r\nLin,Data');
  });

  it('quotes delimiters, line breaks, and escaped quotes', () => {
    expect(jsonToCsv(JSON.stringify([{ note: 'one, "two"\nthree' }])))
      .toBe('note\r\n"one, ""two""\nthree"');
  });

  it('serializes nested values and empty null values', () => {
    expect(jsonToCsv('[{"meta":{"ok":true},"tags":["a"],"none":null}]'))
      .toBe('meta,tags,none\r\n"{""ok"":true}","[""a""]",');
  });

  it('reports invalid JSON with a location', () => {
    expect(() => jsonToCsv('[{"name":}]')).toThrow(/Invalid JSON at row 1, column \d+/);
  });

  it('rejects JSON values that are not object arrays', () => {
    expect(() => jsonToCsv('["Ada"]')).toThrow('array of objects at row 1, column 1');
  });

  it('round-trips CSV data without losing parsed values', () => {
    const csv = 'name,note\r\nAda,"one, two"\r\nLin,"said ""hello"""';
    const json = JSON.stringify(csvToJson(csv));
    expect(csvToJson(jsonToCsv(json))).toEqual(csvToJson(csv));
  });
});
