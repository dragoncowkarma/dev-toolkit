import { describe, expect, it } from 'vitest';
import { textToSlug } from './slug.utils.js';

describe('slug.utils - textToSlug', () => {
  it('transliterates accented and diacritic Latin characters to ASCII equivalents', () => {
    expect(textToSlug('Café — 2026 Résumé!')).toBe('cafe-2026-resume');
    expect(textToSlug('Süsse Straße & Niña')).toBe('susse-strasse-nina');
    expect(textToSlug('Über groß Ångström')).toBe('uber-gross-angstrom');
  });

  it('supports separator selection between hyphen and underscore', () => {
    expect(textToSlug('Hello World Test', { separator: '-' })).toBe('hello-world-test');
    expect(textToSlug('Hello World Test', { separator: '_' })).toBe('hello_world_test');
  });

  it('collapses consecutive separators into a single separator', () => {
    expect(textToSlug('Foo   ---   Bar *** Baz')).toBe('foo-bar-baz');
    expect(textToSlug('Foo   ___   Bar *** Baz', { separator: '_' })).toBe('foo_bar_baz');
  });

  it('trims leading and trailing separators', () => {
    expect(textToSlug('---Hello World---')).toBe('hello-world');
    expect(textToSlug('___Hello World___', { separator: '_' })).toBe('hello_world');
  });

  it('truncates to maxLength without leaving a dangling trailing separator', () => {
    expect(textToSlug('Hello World Example', { maxLength: 11 })).toBe('hello-world');
    expect(textToSlug('Hello World Example', { maxLength: 12 })).toBe('hello-world');
    expect(textToSlug('Hello World Example', { maxLength: 7 })).toBe('hello-w');
    expect(textToSlug('Hello World Example', { maxLength: 0 })).toBe('');
  });

  it('preserves case when preserveCase option is enabled', () => {
    expect(textToSlug('Café Résumé 2026', { preserveCase: true })).toBe('Cafe-Resume-2026');
    expect(textToSlug('Hello_World_Test', { preserveCase: true, separator: '_' })).toBe(
      'Hello_World_Test'
    );
  });

  it('returns empty string for non-representable input and invalid input types', () => {
    expect(textToSlug('')).toBe('');
    expect(textToSlug('!!! @@@ ###')).toBe('');
    expect(textToSlug('😊🎉🚀')).toBe('');
    expect(textToSlug('こんにちは 世界')).toBe('');
    expect(textToSlug(null)).toBe('');
    expect(textToSlug(undefined)).toBe('');
  });
});
