import { describe, expect, it } from 'vitest';
import { formatSql, minifySql } from './sql.utils.js';

describe('formatSql', () => {
  it('breaks major clauses onto their own line at the base indent', () => {
    const result = formatSql('select id, name from users where active = 1');
    expect(result).toBe(
      'SELECT id, name\nFROM users\nWHERE active = 1'
    );
  });

  it('indents AND/OR one level deeper than the owning clause', () => {
    const result = formatSql("SELECT * FROM users WHERE age > 18 AND status = 'active'");
    expect(result).toBe(
      "SELECT *\nFROM users\nWHERE age > 18\n  AND status = 'active'"
    );
  });

  it('breaks JOIN clauses at the same indent as FROM', () => {
    const result = formatSql(
      'SELECT a.id FROM a INNER JOIN b ON a.id = b.a_id LEFT OUTER JOIN c ON b.id = c.b_id'
    );
    expect(result).toBe(
      'SELECT a.id\nFROM a\nINNER JOIN b ON a.id = b.a_id\nLEFT OUTER JOIN c ON b.id = c.b_id'
    );
  });

  it('nests subqueries with increasing indentation', () => {
    const result = formatSql('SELECT * FROM (SELECT id FROM users) AS sub');
    expect(result).toBe(
      'SELECT *\nFROM (\n  SELECT id\n  FROM users\n) AS sub'
    );
  });

  it('nests doubly-nested subqueries at two indent levels', () => {
    const result = formatSql(
      'SELECT * FROM (SELECT id FROM (SELECT id FROM raw) AS inner_q) AS outer_q'
    );
    expect(result).toBe(
      'SELECT *\n' +
      'FROM (\n' +
      '  SELECT id\n' +
      '  FROM (\n' +
      '    SELECT id\n' +
      '    FROM raw\n' +
      '  ) AS inner_q\n' +
      ') AS outer_q'
    );
  });

  it('lists CREATE TABLE column definitions one per line', () => {
    const result = formatSql(
      'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(255) NOT NULL)'
    );
    expect(result).toBe(
      'CREATE TABLE users (\n  id INT PRIMARY KEY,\n  name VARCHAR(255) NOT NULL\n)'
    );
  });

  it('keeps INSERT VALUES lists inline', () => {
    const result = formatSql("INSERT INTO users (id, name) VALUES (1, 'Ada')");
    expect(result).toBe("INSERT INTO users (id, name)\nVALUES (1, 'Ada')");
  });

  it('uppercases keywords by default', () => {
    const result = formatSql('select * from users');
    expect(result).toBe('SELECT *\nFROM users');
  });

  it('lowercases keywords when keywordCase is lower', () => {
    const result = formatSql('SELECT * FROM users', { keywordCase: 'lower' });
    expect(result).toBe('select *\nfrom users');
  });

  it('preserves original keyword casing when keywordCase is preserve', () => {
    const result = formatSql('Select * From users', { keywordCase: 'preserve' });
    expect(result).toBe('Select *\nFrom users');
  });

  it('preserves the original casing of multi-word phrases word by word', () => {
    const result = formatSql('select * from a group By b', { keywordCase: 'preserve' });
    expect(result).toBe('select *\nfrom a\ngroup By b');
  });

  it('supports 4-space indentation', () => {
    const result = formatSql('SELECT * FROM (SELECT id FROM users) AS sub', {
      indentSize: '4',
    });
    expect(result).toBe(
      'SELECT *\nFROM (\n    SELECT id\n    FROM users\n) AS sub'
    );
  });

  it('supports tab indentation', () => {
    const result = formatSql('SELECT * FROM (SELECT id FROM users) AS sub', {
      indentSize: 'tab',
    });
    expect(result).toBe(
      'SELECT *\nFROM (\n\tSELECT id\n\tFROM users\n) AS sub'
    );
  });

  it('preserves single-line comments and forces a following newline', () => {
    const result = formatSql('SELECT id -- primary key\nFROM users');
    expect(result).toBe('SELECT id -- primary key\nFROM users');
  });

  it('preserves block comments inline', () => {
    const result = formatSql('SELECT /* all columns */ * FROM users');
    expect(result).toBe('SELECT /* all columns */ *\nFROM users');
  });

  it('returns an empty string for blank input', () => {
    expect(formatSql('')).toBe('');
    expect(formatSql('   \n  ')).toBe('');
  });

  it('throws a friendly error for an unterminated string literal', () => {
    expect(() => formatSql("SELECT * FROM users WHERE name = 'Ada")).toThrow(
      /unterminated string literal/i
    );
  });

  it('throws a friendly error for an unterminated block comment', () => {
    expect(() => formatSql('SELECT * FROM users /* oops')).toThrow(
      /unterminated block comment/i
    );
  });

  it('rejects an invalid keywordCase option', () => {
    expect(() => formatSql('SELECT 1', { keywordCase: 'shouty' })).toThrow(TypeError);
  });

  it('rejects an invalid indentSize option', () => {
    expect(() => formatSql('SELECT 1', { indentSize: '3' })).toThrow(TypeError);
  });

  it('keeps a named bind parameter contiguous', () => {
    const result = formatSql('SELECT :userId');
    expect(result).toBe('SELECT :userId');
  });

  it('keeps supported bind/host parameter forms contiguous', () => {
    const result = formatSql('SELECT :userId, :1, @userName, $userName, $1, ? FROM users');
    expect(result).toBe('SELECT :userId, :1, @userName, $userName, $1, ?\nFROM users');
  });

  it('does not split a bind parameter across a clause break', () => {
    const result = formatSql('SELECT * FROM users WHERE id = :userId AND name = @userName');
    expect(result).toBe(
      'SELECT *\nFROM users\nWHERE id = :userId\n  AND name = @userName'
    );
  });

  it('keeps the PostgreSQL "::" cast operator contiguous', () => {
    const result = formatSql('SELECT price::numeric FROM items');
    expect(result).toBe('SELECT price :: numeric\nFROM items');
  });
});

describe('minifySql', () => {
  it('collapses whitespace and newlines into a single-line string', () => {
    const input = 'SELECT id,\n  name\nFROM   users\nWHERE active = 1';
    expect(minifySql(input)).toBe('SELECT id, name FROM users WHERE active = 1');
  });

  it('strips single-line comments without corrupting surrounding code', () => {
    const input = 'SELECT id -- the primary key\nFROM users';
    expect(minifySql(input)).toBe('SELECT id FROM users');
  });

  it('strips block comments', () => {
    const input = 'SELECT /* all columns */ * FROM users';
    expect(minifySql(input)).toBe('SELECT * FROM users');
  });

  it('preserves whitespace and quote characters inside string literals', () => {
    const input = "SELECT * FROM users WHERE name = 'Ada   Lovelace'";
    expect(minifySql(input)).toBe("SELECT * FROM users WHERE name = 'Ada   Lovelace'");
  });

  it('preserves escaped quotes inside string literals', () => {
    const input = "SELECT * FROM users WHERE bio = 'it''s a test'";
    expect(minifySql(input)).toBe("SELECT * FROM users WHERE bio = 'it''s a test'");
  });

  it('does not leave a double space where a comment used to be', () => {
    const input = 'SELECT id,\n-- comment\nname FROM users';
    expect(minifySql(input)).toBe('SELECT id, name FROM users');
  });

  it('inserts a separator when a block comment has no surrounding whitespace', () => {
    expect(minifySql('SELECT 1/*comment*/FROM users')).toBe('SELECT 1 FROM users');
    expect(minifySql('SELECT/*comment*/FROM users')).toBe('SELECT FROM users');
  });

  it('inserts a separator when a line comment has no surrounding whitespace', () => {
    expect(minifySql('SELECT 1--comment\nFROM users')).toBe('SELECT 1 FROM users');
  });

  it('does not add an extra space when a comment already has surrounding whitespace', () => {
    expect(minifySql('SELECT 1 /*comment*/ FROM users')).toBe('SELECT 1 FROM users');
    expect(minifySql('SELECT 1/*comment*/ FROM users')).toBe('SELECT 1 FROM users');
    expect(minifySql('SELECT 1 /*comment*/FROM users')).toBe('SELECT 1 FROM users');
  });

  it('returns an empty string for blank input', () => {
    expect(minifySql('')).toBe('');
    expect(minifySql('   \n\t')).toBe('');
  });

  it('throws a friendly error for an unterminated string literal', () => {
    expect(() => minifySql("SELECT * FROM users WHERE name = 'Ada")).toThrow(
      /unterminated string literal/i
    );
  });

  it('keeps bind parameters and the "::" cast operator contiguous', () => {
    const input = 'SELECT :userId,\n  price::numeric\nFROM items\nWHERE id = :userId';
    expect(minifySql(input)).toBe('SELECT :userId, price::numeric FROM items WHERE id = :userId');
  });
});
