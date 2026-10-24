import { describe, expect, it } from 'vitest';
import {
  MAX_INPUT_LENGTH,
  decodeFromMorse,
  encodeToMorse,
  looksLikeMorse,
} from './morse.utils.js';

describe('encodeToMorse', () => {
  it('encodes a simple word', () => {
    expect(encodeToMorse('SOS')).toBe('... --- ...');
  });

  it('encodes mixed-case input the same as uppercase', () => {
    expect(encodeToMorse('Hello')).toBe(encodeToMorse('HELLO'));
  });

  it('separates words with " / "', () => {
    expect(encodeToMorse('HI THERE')).toBe(
      '.... .. / - .... . .-. .'
    );
  });

  it('encodes digits and common punctuation', () => {
    expect(encodeToMorse('SOS 911!')).toBe(
      '... --- ... / ----. .---- .---- -.-.--'
    );
  });

  it('encodes an empty string', () => {
    expect(encodeToMorse('')).toBe('');
  });

  it('encodes a whitespace-only string as empty', () => {
    expect(encodeToMorse('   ')).toBe('');
  });

  it('throws for non-string input', () => {
    expect(() => encodeToMorse(123)).toThrow(TypeError);
  });

  it('throws a descriptive error for unsupported characters', () => {
    expect(() => encodeToMorse('café')).toThrow(/Unsupported character/);
  });

  it('does not freeze on very large input and rejects it instead', () => {
    const huge = 'A'.repeat(MAX_INPUT_LENGTH + 1);
    expect(() => encodeToMorse(huge)).toThrow(/exceeds/);
  });
});

describe('decodeFromMorse', () => {
  it('decodes a simple word', () => {
    expect(decodeFromMorse('... --- ...')).toBe('SOS');
  });

  it('round-trips text through encode and decode', () => {
    const original = 'HELLO WORLD 123';
    expect(decodeFromMorse(encodeToMorse(original))).toBe(original);
  });

  it('decodes words separated by "/"', () => {
    expect(decodeFromMorse('.... .. / - .... . .-. .')).toBe('HI THERE');
  });

  it('treats runs of 2+ spaces as word separators', () => {
    expect(decodeFromMorse('....  ..     -....-  ....-')).toBe('H I - 4');
  });

  it('is tolerant of leading, trailing, and newline whitespace', () => {
    expect(decodeFromMorse('  \n... --- ...\n  ')).toBe('SOS');
  });

  it('decodes an empty string', () => {
    expect(decodeFromMorse('')).toBe('');
  });

  it('decodes a whitespace-only string as empty', () => {
    expect(decodeFromMorse('   ')).toBe('');
  });

  it('throws for non-string input', () => {
    expect(() => decodeFromMorse(123)).toThrow(TypeError);
  });

  it('throws a descriptive error for an invalid Morse token', () => {
    expect(() => decodeFromMorse('.......')).toThrow(/Invalid Morse code token/);
  });

  it('does not freeze on very large input and rejects it instead', () => {
    const huge = '.'.repeat(MAX_INPUT_LENGTH + 1);
    expect(() => decodeFromMorse(huge)).toThrow(/exceeds/);
  });
});

describe('looksLikeMorse', () => {
  it('returns true for Morse-shaped input', () => {
    expect(looksLikeMorse('... --- ...')).toBe(true);
    expect(looksLikeMorse('.... .. / - .... . .-. .')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(looksLikeMorse('SOS')).toBe(false);
    expect(looksLikeMorse('Hello world')).toBe(false);
  });

  it('returns false for empty or non-string input', () => {
    expect(looksLikeMorse('')).toBe(false);
    expect(looksLikeMorse('   ')).toBe(false);
    expect(looksLikeMorse(123)).toBe(false);
  });
});
