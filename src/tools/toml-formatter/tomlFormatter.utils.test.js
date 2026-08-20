import { describe, expect, it } from 'vitest';
import { TomlParseError, formatToml, parseToml, serializeToml } from './tomlFormatter.utils.js';

describe('parseToml', () => {
  it('parses TOML scalar types and produces an equivalent JSON preview', () => {
    const result = formatToml(`basic = "hello\\nworld"
literal = 'C:\\Users\\Ada'
multiline = """
line one
line two"""
integer = 42
float = 3.14
enabled = true
date = 2026-08-19
datetime = 2026-08-19T10:30:00+09:00
values = [1, "two", false]
inline = { owner = "Ada", active = true }`);

    expect(JSON.parse(result.json)).toEqual({
      basic: 'hello\nworld',
      literal: 'C:\\Users\\Ada',
      multiline: 'line one\nline two',
      integer: 42,
      float: 3.14,
      enabled: true,
      date: '2026-08-19',
      datetime: '2026-08-19T10:30:00+09:00',
      values: [1, 'two', false],
      inline: { owner: 'Ada', active: true },
    });
    expect(result.toml).toContain('basic = "hello\\nworld"');
    expect(result.toml).toContain('[inline]');
  });

  it('parses nested tables and arrays of tables', () => {
    const source = `title = "Example"

[owner]
name = "Tom"

[[products]]
name = "Hammer"

[products.details]
sku = 738594937

[[products]]
name = "Nail"`;

    const parsed = parseToml(source);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual({
      title: 'Example',
      owner: { name: 'Tom' },
      products: [
        { name: 'Hammer', details: { sku: 738594937 } },
        { name: 'Nail' },
      ],
    });
    expect(parseToml(serializeToml(parsed))).toBeTruthy();
  });

  it('supports quoted keys, base integers, local date-times, and multiline literals', () => {
    const parsed = parseToml(`"site name" = 'toolkit'
hex = 0xDEAD_BEEF
when = 2026-08-19 10:30:00
message = '''
literal \\ text
'''`);

    expect(JSON.parse(JSON.stringify(parsed))).toEqual({
      'site name': 'toolkit',
      hex: 3735928559,
      when: '2026-08-19 10:30:00',
      message: 'literal \\ text\n',
    });
  });

  it('reports malformed TOML with line and column details', () => {
    let error;
    try {
      parseToml('name = "Ada"\ninvalid = [1 2]');
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(TomlParseError);
    expect(error).toMatchObject({ line: 2 });
    expect(error.column).toBeGreaterThan(0);
    expect(error.message).toContain('Expected');
  });

  it('rejects duplicate keys without throwing an unhandled native exception', () => {
    expect(() => parseToml('name = "Ada"\nname = "Lin"')).toThrow(/Duplicate key/);
  });
});
