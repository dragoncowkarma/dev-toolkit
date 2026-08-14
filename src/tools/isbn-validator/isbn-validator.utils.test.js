import { describe, expect, it } from 'vitest';
import {
  computeIsbn10CheckDigit,
  computeIsbn13CheckDigit,
  convertIsbn10To13,
  convertIsbn13To10,
  normalizeIsbn,
  validateIsbn,
} from './isbn-validator.utils.js';

describe('ISBN validation', () => {
  it.each([
    ['0-306-40615-2', '0306406152'],
    ['0 8044 2957 X', '080442957X'],
  ])('validates a normalized ISBN-10: %s', (input, isbn) => {
    expect(validateIsbn(input)).toMatchObject({
      isValid: true,
      isbn,
      standard: 'ISBN-10',
      error: '',
    });
  });

  it.each([
    ['978-0-306-40615-7', '9780306406157'],
    ['979 10 90636 07 1', '9791090636071'],
  ])('validates a normalized ISBN-13: %s', (input, isbn) => {
    expect(validateIsbn(input)).toMatchObject({
      isValid: true,
      isbn,
      standard: 'ISBN-13',
      error: '',
    });
  });

  it.each([
    ['0-306-40615-3', 'MOD-11'],
    ['978-0-306-40615-8', 'MOD-10'],
    ['9770306406157', '978 or 979'],
    ['03064061X2', 'nine digits followed by a digit or X'],
    ['030640615', 'exactly 10 or 13'],
    ['030640615!', 'only digits'],
  ])('returns a specific controlled error for invalid ISBN input %s', (input, error) => {
    expect(validateIsbn(input)).toMatchObject({
      isValid: false,
      error: expect.stringContaining(error),
    });
  });

  it('normalizes spaces and hyphens before validation', () => {
    expect(normalizeIsbn(' 978-0 306-40615 7 ')).toEqual({
      isbn: '9780306406157',
      error: '',
    });
  });
});

describe('ISBN conversion', () => {
  it('converts a valid ISBN-10 to its 978-prefixed ISBN-13 equivalent', () => {
    expect(convertIsbn10To13('0-306-40615-2')).toMatchObject({
      isValid: true,
      standard: 'ISBN-13',
      convertedIsbn: '9780306406157',
      error: '',
    });
  });

  it('converts an eligible 978-prefixed ISBN-13 to ISBN-10', () => {
    expect(convertIsbn13To10('978-0-306-40615-7')).toMatchObject({
      isValid: true,
      standard: 'ISBN-10',
      convertedIsbn: '0306406152',
      error: '',
    });
  });

  it('rejects 979-prefixed ISBN-13 conversion to ISBN-10', () => {
    expect(convertIsbn13To10('979-10-90636-07-1')).toMatchObject({
      isValid: false,
      error: expect.stringContaining('979'),
    });
  });

  it('computes the official check digits used by both conversions', () => {
    expect(computeIsbn13CheckDigit('978030640615')).toBe('7');
    expect(computeIsbn10CheckDigit('030640615')).toBe('2');
  });
});
