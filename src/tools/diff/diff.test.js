import { describe, expect, it, vi } from 'vitest';
import {
  buildDiffRows,
  computeLineOps,
  diffLines,
  diffTokens,
  generateUnifiedDiff,
  readFileAsText,
  splitLines,
  tokenizeLine,
} from './diff.utils.js';

describe('splitLines', () => {
  it('returns an empty array for an empty string', () => {
    expect(splitLines('')).toEqual([]);
  });

  it('splits on newlines', () => {
    expect(splitLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('treats a trailing newline as a trailing empty line', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b', '']);
  });
});

describe('computeLineOps', () => {
  it('marks everything equal for identical inputs', () => {
    const ops = computeLineOps(['a', 'b'], ['a', 'b']);
    expect(ops).toEqual([
      { type: 'equal', aIndex: 0, bIndex: 0 },
      { type: 'equal', aIndex: 1, bIndex: 1 },
    ]);
  });

  it('produces a delete+insert pair for a single changed line', () => {
    const ops = computeLineOps(['a', 'b', 'c'], ['a', 'x', 'c']);
    expect(ops).toEqual([
      { type: 'equal', aIndex: 0, bIndex: 0 },
      { type: 'delete', aIndex: 1, bIndex: -1 },
      { type: 'insert', aIndex: -1, bIndex: 1 },
      { type: 'equal', aIndex: 2, bIndex: 2 },
    ]);
  });

  it('handles pure insertions', () => {
    const ops = computeLineOps(['a', 'c'], ['a', 'b', 'c']);
    expect(ops).toEqual([
      { type: 'equal', aIndex: 0, bIndex: 0 },
      { type: 'insert', aIndex: -1, bIndex: 1 },
      { type: 'equal', aIndex: 1, bIndex: 2 },
    ]);
  });

  it('handles pure deletions', () => {
    const ops = computeLineOps(['a', 'b', 'c'], ['a', 'c']);
    expect(ops).toEqual([
      { type: 'equal', aIndex: 0, bIndex: 0 },
      { type: 'delete', aIndex: 1, bIndex: -1 },
      { type: 'equal', aIndex: 2, bIndex: 1 },
    ]);
  });

  it('handles two completely disjoint inputs', () => {
    const ops = computeLineOps(['a', 'b'], ['x', 'y']);
    expect(ops.filter((op) => op.type === 'equal')).toEqual([]);
    expect(ops.filter((op) => op.type === 'delete')).toHaveLength(2);
    expect(ops.filter((op) => op.type === 'insert')).toHaveLength(2);
  });

  it('handles two empty inputs', () => {
    expect(computeLineOps([], [])).toEqual([]);
  });
});

describe('tokenizeLine', () => {
  it('splits words, whitespace, and punctuation into separate tokens', () => {
    expect(tokenizeLine('foo, bar!')).toEqual(['foo', ',', ' ', 'bar', '!']);
  });

  it('returns an empty array for an empty line', () => {
    expect(tokenizeLine('')).toEqual([]);
  });
});

describe('diffTokens', () => {
  it('finds the single changed word between two similar lines', () => {
    const ops = diffTokens('the quick fox', 'the slow fox');
    expect(ops).toEqual([
      { type: 'equal', value: 'the' },
      { type: 'equal', value: ' ' },
      { type: 'delete', value: 'quick' },
      { type: 'insert', value: 'slow' },
      { type: 'equal', value: ' ' },
      { type: 'equal', value: 'fox' },
    ]);
  });

  it('marks everything as equal for identical lines', () => {
    const ops = diffTokens('hello world', 'hello world');
    expect(ops.every((op) => op.type === 'equal')).toBe(true);
  });
});

describe('buildDiffRows', () => {
  it('pairs a single delete/insert run into a modified row with token data', () => {
    const oldLines = ['a', 'foo bar', 'c'];
    const newLines = ['a', 'foo baz', 'c'];
    const ops = computeLineOps(oldLines, newLines);
    const { rows, stats } = buildDiffRows(oldLines, newLines, ops);

    expect(rows.map((row) => row.type)).toEqual(['unchanged', 'modified', 'unchanged']);
    expect(rows[1].tokens.some((t) => t.type === 'delete' && t.value === 'bar')).toBe(true);
    expect(rows[1].tokens.some((t) => t.type === 'insert' && t.value === 'baz')).toBe(true);
    expect(stats).toEqual({ added: 0, removed: 0, modified: 1, unchanged: 2 });
  });

  it('leaves leftover deletes/inserts as pure removed/added rows', () => {
    const oldLines = ['a', 'b', 'c'];
    const newLines = ['a', 'x'];
    const ops = computeLineOps(oldLines, newLines);
    const { rows, stats } = buildDiffRows(oldLines, newLines, ops);

    expect(rows.map((row) => row.type)).toEqual(['unchanged', 'modified', 'removed']);
    expect(stats).toEqual({ added: 0, removed: 1, modified: 1, unchanged: 1 });
  });
});

describe('diffLines', () => {
  it('reports zero changes for identical texts', () => {
    const { rows, stats } = diffLines('a\nb\nc', 'a\nb\nc');
    expect(stats).toEqual({ added: 0, removed: 0, modified: 0, unchanged: 3 });
    expect(rows.every((row) => row.type === 'unchanged')).toBe(true);
  });

  it('detects a pure addition', () => {
    const { stats } = diffLines('a\nb', 'a\nb\nc');
    expect(stats).toEqual({ added: 1, removed: 0, modified: 0, unchanged: 2 });
  });

  it('detects a pure removal', () => {
    const { stats } = diffLines('a\nb\nc', 'a\nc');
    expect(stats).toEqual({ added: 0, removed: 1, modified: 0, unchanged: 2 });
  });

  it('handles two empty texts', () => {
    expect(diffLines('', '')).toEqual({
      rows: [],
      stats: { added: 0, removed: 0, modified: 0, unchanged: 0 },
    });
  });

  it('treats a totally different replacement text as a full removal + addition', () => {
    const { stats } = diffLines('line one\nline two', 'completely different');
    expect(stats.modified + stats.removed).toBeGreaterThan(0);
    expect(stats.modified + stats.added).toBeGreaterThan(0);
  });
});

describe('generateUnifiedDiff', () => {
  it('returns an empty string for identical texts', () => {
    expect(generateUnifiedDiff('a\nb', 'a\nb')).toBe('');
  });

  it('produces a standard unified diff with labels and a hunk header', () => {
    const result = generateUnifiedDiff('a\nb\nc', 'a\nx\nc', {
      oldLabel: 'original',
      newLabel: 'modified',
      context: 1,
    });

    expect(result).toBe(
      ['--- original', '+++ modified', '@@ -1,3 +1,3 @@', ' a', '-b', '+x', ' c'].join('\n'),
    );
  });

  it('splits far-apart changes into separate hunks', () => {
    const oldText = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const lines = oldText.split('\n');
    lines[0] = 'CHANGED-0';
    lines[19] = 'CHANGED-19';
    const newText = lines.join('\n');

    const result = generateUnifiedDiff(oldText, newText, { context: 2 });
    const hunkHeaders = result.split('\n').filter((line) => line.startsWith('@@'));
    expect(hunkHeaders).toHaveLength(2);
  });

  it('merges changes that fall within the context window into one hunk', () => {
    const oldText = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
    const lines = oldText.split('\n');
    lines[2] = 'CHANGED-2';
    lines[5] = 'CHANGED-5';
    const newText = lines.join('\n');

    const result = generateUnifiedDiff(oldText, newText, { context: 3 });
    const hunkHeaders = result.split('\n').filter((line) => line.startsWith('@@'));
    expect(hunkHeaders).toHaveLength(1);
  });

  it('produces a zero-count old range for a pure insertion at the start', () => {
    const result = generateUnifiedDiff('a', 'new\na', { context: 0 });
    expect(result).toBe(['--- a', '+++ b', '@@ -0,0 +1,1 @@', '+new'].join('\n'));
  });
});

describe('readFileAsText', () => {
  it('resolves with the text content of a file', async () => {
    const file = new File(['hello world'], 'greeting.txt', { type: 'text/plain' });
    await expect(readFileAsText(file)).resolves.toBe('hello world');
  });

  it('rejects when the file cannot be read', async () => {
    const failingReader = {
      readAsText: vi.fn(function readAsText() {
        this.onerror(new Error('boom'));
      }),
    };
    const OriginalFileReader = global.FileReader;
    global.FileReader = vi.fn(function FileReader() {
      return failingReader;
    });

    await expect(readFileAsText(new File(['x'], 'x.txt'))).rejects.toThrow(
      'Failed to read the selected file.',
    );

    global.FileReader = OriginalFileReader;
  });
});
