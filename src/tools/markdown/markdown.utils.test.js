import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown.utils.js';

describe('parseMarkdown headers', () => {
  it('renders h1 through h6', () => {
    for (let level = 1; level <= 6; level += 1) {
      const markdown = `${'#'.repeat(level)} Heading ${level}`;
      expect(parseMarkdown(markdown)).toBe(`<h${level}>Heading ${level}</h${level}>`);
    }
  });

  it('does not render a header without a space after the hashes', () => {
    expect(parseMarkdown('#NotAHeader')).toBe('<p>#NotAHeader</p>');
  });
});

describe('parseMarkdown emphasis', () => {
  it('renders bold text with ** and __', () => {
    expect(parseMarkdown('**bold**')).toBe('<p><strong>bold</strong></p>');
    expect(parseMarkdown('__bold__')).toBe('<p><strong>bold</strong></p>');
  });

  it('renders italic text with * and _', () => {
    expect(parseMarkdown('*italic*')).toBe('<p><em>italic</em></p>');
    expect(parseMarkdown('_italic_')).toBe('<p><em>italic</em></p>');
  });

  it('renders strikethrough text', () => {
    expect(parseMarkdown('~~gone~~')).toBe('<p><del>gone</del></p>');
  });
});

describe('parseMarkdown code', () => {
  it('renders inline code spans', () => {
    expect(parseMarkdown('Use `npm install` first')).toBe(
      '<p>Use <code>npm install</code> first</p>'
    );
  });

  it('renders fenced code blocks and preserves internal whitespace', () => {
    const markdown = '```js\nconst a = 1;\nconst b = 2;\n```';
    expect(parseMarkdown(markdown)).toBe(
      '<pre><code class="language-js">const a = 1;\nconst b = 2;</code></pre>'
    );
  });

  it('renders fenced code blocks without a language', () => {
    const markdown = '```\nplain text\n```';
    expect(parseMarkdown(markdown)).toBe('<pre><code>plain text</code></pre>');
  });

  it('does not apply inline formatting inside fenced code blocks', () => {
    const markdown = '```\n**not bold**\n```';
    expect(parseMarkdown(markdown)).toBe('<pre><code>**not bold**</code></pre>');
  });
});

describe('parseMarkdown lists', () => {
  it('renders unordered lists from -, *, and + markers', () => {
    expect(parseMarkdown('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
    expect(parseMarkdown('* one\n* two')).toBe('<ul><li>one</li><li>two</li></ul>');
    expect(parseMarkdown('+ one\n+ two')).toBe('<ul><li>one</li><li>two</li></ul>');
  });

  it('renders ordered lists', () => {
    expect(parseMarkdown('1. first\n2. second')).toBe(
      '<ol><li>first</li><li>second</li></ol>'
    );
  });
});

describe('parseMarkdown links', () => {
  it('renders links with a safe target and rel attribute', () => {
    expect(parseMarkdown('[Dev Toolkit](https://example.com)')).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">Dev Toolkit</a></p>'
    );
  });

  it('replaces javascript: URLs with a safe placeholder', () => {
    const result = parseMarkdown('[click me](javascript:alert(1))');
    expect(result).toContain('href="#"');
    expect(result).not.toContain('javascript:');
  });

  it('replaces data: URLs with a safe placeholder', () => {
    const result = parseMarkdown('[open](data:text/html,<script>alert(1)</script>)');
    expect(result).toContain('href="#"');
    expect(result).not.toContain('data:text/html');
  });
});

describe('parseMarkdown blockquotes and horizontal rules', () => {
  it('renders blockquotes', () => {
    expect(parseMarkdown('> a wise quote')).toBe('<blockquote>a wise quote</blockquote>');
  });

  it('renders horizontal rules from ---, ***, and ___', () => {
    expect(parseMarkdown('---')).toBe('<hr />');
    expect(parseMarkdown('***')).toBe('<hr />');
    expect(parseMarkdown('___')).toBe('<hr />');
  });
});

describe('parseMarkdown XSS sanitization', () => {
  it('escapes script tags instead of rendering them', () => {
    const result = parseMarkdown('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('escapes inline HTML event handler attributes', () => {
    const result = parseMarkdown('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;img');
  });

  it('escapes raw HTML found inside fenced code blocks', () => {
    const result = parseMarkdown('```\n<script>alert(1)</script>\n```');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('escapes raw HTML found inside list items and blockquotes', () => {
    expect(parseMarkdown('- <script>alert(1)</script>')).not.toContain('<script>');
    expect(parseMarkdown('> <script>alert(1)</script>')).not.toContain('<script>');
  });
});

describe('parseMarkdown literal control-character input', () => {
  const zeroChar = String.fromCharCode(0);
  const buildTag = (label) => zeroChar.concat(label, zeroChar);

  it('renders text containing a literal zero byte as plain text', () => {
    const markdown = buildTag('TAG0');
    expect(parseMarkdown(markdown)).toBe(`<p>${buildTag('TAG0')}</p>`);
  });

  it('preserves zero-byte-delimited text placed after a real inline code span', () => {
    const markdown = '`npm install`'.concat(buildTag('TAG0'));
    expect(parseMarkdown(markdown)).toBe(
      '<p><code>npm install</code>'.concat(buildTag('TAG0'), '</p>')
    );
  });
});

describe('parseMarkdown edge cases', () => {
  it('returns an empty string for empty or whitespace-only input', () => {
    expect(parseMarkdown('')).toBe('');
    expect(parseMarkdown('   \n\n  ')).toBe('');
  });

  it('throws a TypeError for non-string input', () => {
    expect(() => parseMarkdown(null)).toThrow(TypeError);
    expect(() => parseMarkdown(42)).toThrow(TypeError);
  });

  it('renders multiple paragraphs separated by blank lines', () => {
    expect(parseMarkdown('First paragraph.\n\nSecond paragraph.')).toBe(
      '<p>First paragraph.</p>\n<p>Second paragraph.</p>'
    );
  });
});
