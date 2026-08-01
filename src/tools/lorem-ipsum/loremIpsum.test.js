import { describe, expect, it } from 'vitest';
import {
  LOREM_UNITS,
  generateLoremIpsum,
  getLoremIpsumStatistics,
} from './loremIpsum.utils.js';

const deterministicRandom = () => 0;

describe('generateLoremIpsum', () => {
  it('generates the requested number of paragraphs', () => {
    const output = generateLoremIpsum({
      unit: LOREM_UNITS.PARAGRAPHS,
      count: 2,
      random: deterministicRandom,
    });

    expect(output.split('\n\n')).toHaveLength(2);
    expect(output).toStartWith('Lorem ipsum dolor sit amet, consectetur adipiscing elit.');
  });

  it('generates the requested number of sentences', () => {
    const output = generateLoremIpsum({
      unit: LOREM_UNITS.SENTENCES,
      count: 3,
      startWithLorem: false,
      random: deterministicRandom,
    });

    expect(output.split('\n\n')).toHaveLength(3);
    expect(output.match(/\./g)).toHaveLength(3);
  });

  it('generates the requested number of words', () => {
    const output = generateLoremIpsum({
      unit: LOREM_UNITS.WORDS,
      count: 5,
      startWithLorem: false,
      random: deterministicRandom,
    });

    expect(output.split(' ')).toHaveLength(5);
  });

  it('can include or omit the standard opening', () => {
    const withOpening = generateLoremIpsum({
      unit: LOREM_UNITS.SENTENCES,
      count: 1,
      random: deterministicRandom,
    });
    const withoutOpening = generateLoremIpsum({
      unit: LOREM_UNITS.SENTENCES,
      count: 1,
      startWithLorem: false,
      random: deterministicRandom,
    });

    expect(withOpening).toStartWith('Lorem ipsum dolor sit amet');
    expect(withoutOpening).not.toStartWith('Lorem ipsum dolor sit amet');
  });

  it('wraps generated blocks in paragraph tags when requested', () => {
    const output = generateLoremIpsum({
      unit: LOREM_UNITS.PARAGRAPHS,
      count: 2,
      includeHtml: true,
      random: deterministicRandom,
    });

    expect(output).toMatch(/^<p>.*<\/p>\n<p>.*<\/p>$/);
  });
});

describe('getLoremIpsumStatistics', () => {
  it('excludes paragraph tags from word count and includes them in character count', () => {
    expect(getLoremIpsumStatistics('<p>Lorem ipsum</p>')).toEqual({
      wordCount: 2,
      characterCount: 18,
    });
  });
});
