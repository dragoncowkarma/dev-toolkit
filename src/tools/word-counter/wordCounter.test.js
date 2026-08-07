import { describe, expect, it } from 'vitest';
import {
  computeTextStats,
  formatStatsSummary,
  getByteSize,
  getCharacterCount,
  getParagraphCount,
  getReadingTime,
  getSentenceCount,
  getWordCount,
} from './wordCounter.utils.js';

describe('getWordCount', () => {
  it('returns 0 for empty or whitespace-only strings', () => {
    expect(getWordCount('')).toBe(0);
    expect(getWordCount('   ')).toBe(0);
    expect(getWordCount('\n\t  \r')).toBe(0);
    expect(getWordCount(null)).toBe(0);
    expect(getWordCount(undefined)).toBe(0);
  });

  it('counts single word', () => {
    expect(getWordCount('hello')).toBe(1);
    expect(getWordCount('  hello  ')).toBe(1);
  });

  it('handles multiple spaces, tabs, and newlines correctly', () => {
    expect(getWordCount('The   quick\tbrown\nfox  jumps')).toBe(5);
  });
});

describe('getCharacterCount', () => {
  it('handles empty and null input', () => {
    expect(getCharacterCount('')).toBe(0);
    expect(getCharacterCount(null)).toBe(0);
  });

  it('counts characters with and without whitespace', () => {
    const text = 'Hello world!\nTest';
    expect(getCharacterCount(text, true)).toBe(17);
    expect(getCharacterCount(text, false)).toBe(15);
  });

  it('handles whitespace-only input', () => {
    expect(getCharacterCount('   ', true)).toBe(3);
    expect(getCharacterCount('   ', false)).toBe(0);
  });

  it('handles unicode code points correctly', () => {
    expect(getCharacterCount('😀', true)).toBe(1);
    expect(getCharacterCount('😀', false)).toBe(1);
  });
});

describe('getSentenceCount', () => {
  it('returns 0 for empty or whitespace-only input', () => {
    expect(getSentenceCount('')).toBe(0);
    expect(getSentenceCount('   ')).toBe(0);
  });

  it('counts sentences ending with periods, exclamation marks, and question marks', () => {
    expect(getSentenceCount('Hello world')).toBe(1);
    expect(getSentenceCount('Hello world.')).toBe(1);
    expect(getSentenceCount('First sentence. Second sentence! Third sentence?')).toBe(3);
  });

  it('tolerates common abbreviations and decimal numbers', () => {
    expect(getSentenceCount('Dr. Smith arrived at 5.30 p.m. He was happy.')).toBe(2);
    expect(getSentenceCount('E.g. Mr. Jones vs. Dr. White.')).toBe(1);
  });
});

describe('getParagraphCount', () => {
  it('returns 0 for empty or whitespace-only input', () => {
    expect(getParagraphCount('')).toBe(0);
    expect(getParagraphCount('   ')).toBe(0);
  });

  it('counts single paragraph with newlines within it', () => {
    expect(getParagraphCount('Line 1\nLine 2')).toBe(1);
  });

  it('counts multi-paragraph text split by blank lines', () => {
    const text = 'Paragraph 1 line 1.\nParagraph 1 line 2.\n\nParagraph 2.\n\n\nParagraph 3.';
    expect(getParagraphCount(text)).toBe(3);
  });
});

describe('getReadingTime', () => {
  it('returns 0 min read for zero or negative words', () => {
    expect(getReadingTime(0)).toEqual({ minutes: 0, text: '0 min read' });
    expect(getReadingTime(-5)).toEqual({ minutes: 0, text: '0 min read' });
  });

  it('calculates reading time with default WPM (200)', () => {
    expect(getReadingTime(100)).toEqual({ minutes: 1, text: '1 min read' });
    expect(getReadingTime(200)).toEqual({ minutes: 1, text: '1 min read' });
    expect(getReadingTime(201)).toEqual({ minutes: 2, text: '2 min read' });
    expect(getReadingTime(500)).toEqual({ minutes: 3, text: '3 min read' });
  });

  it('supports custom WPM', () => {
    expect(getReadingTime(300, 100)).toEqual({ minutes: 3, text: '3 min read' });
  });
});

describe('getByteSize', () => {
  it('returns 0 for empty or non-string input', () => {
    expect(getByteSize('')).toBe(0);
    expect(getByteSize(null)).toBe(0);
  });

  it('returns UTF-8 byte size for ASCII', () => {
    expect(getByteSize('hello')).toBe(5);
  });

  it('demonstrates char count vs byte size divergence for emoji/multi-byte input', () => {
    const text = 'Hello 😀 한국어';
    const charCount = getCharacterCount(text, true);
    const byteSize = getByteSize(text);

    // 'Hello ' = 6 chars, '😀' = 1 char, ' ' = 1 char, '한국어' = 3 chars -> 11 chars
    expect(charCount).toBe(11);
    // 'Hello ' = 6 bytes, '😀' = 4 bytes, ' ' = 1 byte, '한국어' = 9 bytes (3*3) -> 20 bytes
    expect(byteSize).toBe(20);
    expect(byteSize).toBeGreaterThan(charCount);
  });
});

describe('computeTextStats', () => {
  it('returns all zero counts for empty input without throwing', () => {
    const stats = computeTextStats('');
    expect(stats).toEqual({
      words: 0,
      characters: 0,
      charactersNoSpaces: 0,
      sentences: 0,
      paragraphs: 0,
      readingTimeMinutes: 0,
      readingTimeText: '0 min read',
      byteSize: 0,
    });
  });

  it('computes accurate stats for a multi-paragraph document', () => {
    const doc = 'Hello world. This is sentence two!\n\nSecond paragraph here.';
    const stats = computeTextStats(doc);

    expect(stats.words).toBe(9);
    expect(stats.characters).toBe(58);
    expect(stats.sentences).toBe(3);
    expect(stats.paragraphs).toBe(2);
    expect(stats.readingTimeText).toBe('1 min read');
  });

  it('handles large input performance efficiently (smoke assertion for >50,000 chars)', () => {
    const sampleChunk = 'The quick brown fox jumps over the lazy dog. '; // 45 chars, 9 words
    const largeText = sampleChunk.repeat(1200); // 54,000 chars, 10,800 words

    const startTime = performance.now();
    const stats = computeTextStats(largeText);
    const duration = performance.now() - startTime;

    expect(stats.characters).toBe(54000);
    expect(stats.words).toBe(10800);
    expect(stats.readingTimeText).toBe('54 min read');
    // Responsive execution check (< 1000ms)
    expect(duration).toBeLessThan(1000);
  });
});

describe('formatStatsSummary', () => {
  it('formats stats into plain text summary', () => {
    const stats = computeTextStats('Hello world');
    const summary = formatStatsSummary(stats);

    expect(summary).toContain('Words: 2');
    expect(summary).toContain('Characters (with spaces): 11');
    expect(summary).toContain('Reading time: 1 min read');
  });

  it('returns empty string for null stats', () => {
    expect(formatStatsSummary(null)).toBe('');
  });
});
