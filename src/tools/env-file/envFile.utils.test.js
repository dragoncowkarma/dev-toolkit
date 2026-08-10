import { describe, expect, it } from 'vitest';
import {
  findMissingKeys,
  maskValue,
  parseEnvFile,
  toExampleTemplate,
  toJSON,
  toShellExport,
  toYAML,
} from './envFile.utils.js';

const SAMPLE = [
  '# Production settings',
  'export API_URL=https://example.test # public endpoint',
  "NAME='Ada Lovelace'",
  'TOKEN="line\\ntwo\\"quote\\"\\\\slash"',
  'API_URL=https://override.test',
].join('\n');

describe('parseEnvFile', () => {
  it('parses comments, exports, quotes, escapes, comments, and duplicate keys', () => {
    const { entries, errors } = parseEnvFile(SAMPLE);

    expect(errors).toEqual([]);
    expect(entries).toEqual([
      expect.objectContaining({
        key: 'API_URL', value: 'https://example.test', line: 2, isExport: true,
      }),
      expect.objectContaining({ key: 'NAME', value: 'Ada Lovelace', quote: 'single' }),
      expect.objectContaining({
        key: 'TOKEN',
        value: 'line\ntwo"quote"\\slash',
        quote: 'double',
      }),
      expect.objectContaining({
        key: 'API_URL',
        value: 'https://override.test',
        isDuplicate: true,
      }),
    ]);
  });

  it('keeps parsing after malformed keys, bare keys, and unterminated quotes', () => {
    const result = parseEnvFile('GOOD=yes\nBAD-KEY=value\nBARE\nBROKEN="value\nNEXT=ok');

    expect(result.entries.map(({ key }) => key)).toEqual(['GOOD', 'NEXT']);
    expect(result.errors).toEqual([
      expect.objectContaining({ line: 2, message: expect.stringContaining('Invalid') }),
      expect.objectContaining({ line: 3, message: expect.stringContaining('Expected') }),
      expect.objectContaining({ line: 4, message: expect.stringContaining('Unterminated') }),
    ]);
  });
});

describe('dotenv output helpers', () => {
  it('uses the final duplicate value for JSON and YAML while preserving source key order', () => {
    const { entries } = parseEnvFile(SAMPLE);

    expect(toJSON(entries)).toEqual({
      API_URL: 'https://override.test',
      NAME: 'Ada Lovelace',
      TOKEN: 'line\ntwo"quote"\\slash',
    });
    expect(toYAML(entries)).toBe(
      'API_URL: https://override.test\nNAME: Ada Lovelace\nTOKEN: |-\n'
        + '  line\n  two"quote"\\slash\n'
    );
  });

  it('creates shell exports and a comment-preserving empty template', () => {
    const { entries } = parseEnvFile(SAMPLE);

    expect(toShellExport(entries)).toContain(
      'export TOKEN="line\ntwo\\"quote\\"\\\\slash"'
    );
    expect(toExampleTemplate(entries)).toBe(
      '# Production settings\nexport API_URL=\nNAME=\nTOKEN=\nAPI_URL='
    );
  });
});

describe('findMissingKeys', () => {
  it('reports each asymmetric key list once and in source order', () => {
    const source = parseEnvFile('A=1\nB=2\nB=3').entries;
    const example = parseEnvFile('B=\nC=').entries;

    expect(findMissingKeys(source, example)).toEqual({
      missingInSource: ['C'],
      missingInExample: ['A'],
    });
  });
});

describe('maskValue', () => {
  it('reveals only a requested trailing suffix and masks short values fully', () => {
    expect(maskValue('sk_live_abc123')).toBe('••••••••••c123');
    expect(maskValue('abc', 4)).toBe('•••');
    expect(maskValue('abc', 0)).toBe('•••');
  });
});
