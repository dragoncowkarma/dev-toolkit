import { describe, expect, it } from 'vitest';
import { formatTypeScript, generateTypeScript, inferType } from './jsonTypeGenerator.utils.js';

describe('inferType', () => {
  it('infers primitives, null, empty arrays, and empty objects', () => {
    expect(inferType('text')).toEqual({ kind: 'string' });
    expect(inferType(null)).toEqual({ kind: 'null' });
    expect(formatTypeScript({ empty: {}, values: [] })).toBe(
      'export type Root = {\n  empty: {};\n  values: unknown[];\n};',
    );
  });

  it('formats nested objects with stable property ordering', () => {
    const value = { zebra: true, account: { name: 'Ada', id: 1 } };
    const output = formatTypeScript(value, { rootName: 'Profile', declaration: 'interface' });
    expect(output).toBe(
      'export interface Profile {\n  account: {\n    id: number;\n    name: string;\n  };\n  zebra: boolean;\n}',
    );
    expect(formatTypeScript(value, { rootName: 'Profile', declaration: 'interface' })).toBe(output);
  });

  it('merges compatible object-array shapes and makes missing fields optional', () => {
    expect(formatTypeScript([{ id: 1, name: 'Ada' }, { id: 2, active: true }])).toBe(
      'export type Root = {\n  active?: boolean;\n  id: number;\n  name?: string;\n}[];',
    );
  });

  it('uses unions only for heterogeneous array values, including null', () => {
    expect(formatTypeScript([1, 2])).toBe('export type Root = number[];');
    expect(formatTypeScript([1, 'two', null])).toBe('export type Root = (null | number | string)[];');
  });

  it('supports readonly, explicit undefined, and indentation settings', () => {
    expect(formatTypeScript([{ id: 1 }, { id: 2, label: 'two' }], {
      readonly: true,
      optionalProperties: false,
      indent: '    ',
    })).toContain('    readonly label: string | undefined;');
  });

  it('returns malformed JSON errors without throwing', () => {
    expect(generateTypeScript('{"id": }')).toMatchObject({ output: '', error: expect.stringContaining('Invalid JSON:') });
    expect(generateTypeScript('')).toEqual({ output: '', error: '' });
  });
});
