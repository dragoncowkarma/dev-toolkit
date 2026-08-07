import { describe, expect, it, vi } from 'vitest';
import {
  YamlConversionError,
  jsonToYaml,
  yamlToJson,
} from './yaml.utils.js';

describe('yamlToJson', () => {
  it('converts nested YAML mappings and sequences into formatted JSON', () => {
    const yaml = `project:
  enabled: true
  formats:
    - YAML
    - JSON
  retries: 3`;

    expect(JSON.parse(yamlToJson(yaml))).toEqual({
      project: {
        enabled: true,
        formats: ['YAML', 'JSON'],
        retries: 3,
      },
    });
  });

  it('reports a duplicate mapping key with a one-based YAML line number', () => {
    let error;

    try {
      yamlToJson('name: Jane\nname: Alex');
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(YamlConversionError);
    expect(error).toMatchObject({ format: 'YAML', line: 2, column: 1 });
    expect(error.message).toContain('duplicated mapping key');
  });

  it('rejects empty YAML input', () => {
    expect(() => yamlToJson('  \n')).toThrow('YAML input cannot be empty.');
  });

  it('preserves timestamps as strings instead of changing their timezone', () => {
    const yaml = 'datetime: 2024-02-29T12:34:56+09:00';

    expect(JSON.parse(yamlToJson(yaml))).toEqual({
      datetime: '2024-02-29T12:34:56+09:00',
    });
  });

  it('rejects numbers that cannot be represented in JSON without data loss', () => {
    expect(() => yamlToJson('value: .nan')).toThrow('Non-finite numbers');
    expect(() => yamlToJson('value: 9007199254740993')).toThrow('safe range');
    expect(() => yamlToJson('value: 0.123456789012345678901')).toThrow(
      'more than 15 significant digits',
    );
    expect(() => yamlToJson('value: 123456789012345678e-3')).toThrow(
      'more than 15 significant digits',
    );
    expect(() => yamlToJson('value: 1e-400')).toThrow('too small to represent');
    expect(() => yamlToJson('value: 1e309')).toThrow('outside JavaScript range');
    expect(() => yamlToJson('value: &overflow 1e309')).toThrow(
      'outside JavaScript range',
    );
  });

  it('preserves quoted number-looking YAML strings', () => {
    expect(JSON.parse(yamlToJson('value: "1e309"'))).toEqual({ value: '1e309' });
  });

  it('allows a safe integer written with a decimal suffix', () => {
    expect(JSON.parse(yamlToJson('value: 9007199254740991.0'))).toEqual({
      value: 9007199254740991,
    });
  });

  it('rejects YAML mapping keys that JSON cannot represent', () => {
    expect(() => yamlToJson('? {a: b}\n: value')).toThrow('mapping keys must be strings');
    expect(() => yamlToJson('1: answer')).toThrow('mapping keys must be strings');
  });

  it('does not mistake block scalar content for a YAML mapping key', () => {
    expect(JSON.parse(yamlToJson('message: |\n  1: answer'))).toEqual({
      message: '1: answer\n',
    });
  });
});

describe('jsonToYaml', () => {
  const json = JSON.stringify({
    project: {
      enabled: true,
      formats: ['YAML', 'JSON'],
    },
  });

  it('converts JSON into valid YAML with two-space indentation by default', () => {
    const yaml = jsonToYaml(json);

    expect(yaml).toContain('  enabled: true');
    expect(yaml).toContain('    - YAML');
    expect(yamlToJson(yaml)).toBe(JSON.stringify(JSON.parse(json), null, 2));
  });

  it('uses four spaces when requested', () => {
    const yaml = jsonToYaml(json, 4);

    expect(yaml).toContain('    enabled: true');
    expect(yaml).toContain('        - YAML');
  });

  it('reports a JSON syntax error with a one-based line and column', () => {
    const invalidJson = '{\n  "name": "Jane"\n  "age": 42\n}';
    let error;

    try {
      jsonToYaml(invalidJson);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(YamlConversionError);
    expect(error).toMatchObject({ format: 'JSON', line: 3, column: 3 });
    expect(error.message).toContain('JSON input error');
  });

  it('uses line and column data from non-V8 JSON syntax errors', () => {
    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      throw new SyntaxError('Unexpected token at line 4 column 7');
    });
    let error;

    try {
      jsonToYaml('{"name":"Ada"}');
    } catch (caught) {
      error = caught;
    } finally {
      parseSpy.mockRestore();
    }

    expect(error).toMatchObject({ format: 'JSON', line: 4, column: 7 });
  });

  it('rejects JSON decimals that would be rounded before YAML serialization', () => {
    expect(() => jsonToYaml('{"value":0.123456789012345678901}')).toThrow(
      'more than 15 significant digits',
    );
    expect(() => jsonToYaml('{"value":123456789012345678e-3}')).toThrow(
      'more than 15 significant digits',
    );
    expect(() => jsonToYaml('{"value":1e-400}')).toThrow('too small to represent');
  });

  it('allows a safe JSON integer written with a decimal suffix', () => {
    expect(jsonToYaml('{"value":9007199254740991.0}')).toContain(
      'value: 9007199254740991',
    );
  });
});
