const DEFAULT_CONTEXT = 3;
const TOKEN_PATTERN = /\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g;
// Bounds Myers' trace memory (O(D^2) integers) to a few tens of MB even when
// two large inputs share nothing in common and the true edit distance is huge.
const MAX_EDIT_DISTANCE = 2000;

/**
 * @typedef {object} DiffStats
 * @property {number} added
 * @property {number} removed
 * @property {number} modified
 * @property {number} unchanged
 */

/**
 * @typedef {object} DiffResult
 * @property {Array<object>} rows
 * @property {DiffStats} stats
 */

/**
 * Splits text into an array of lines. An empty string yields an empty array.
 * @param {string} text
 * @returns {string[]}
 */
export function splitLines(text) {
  if (text === '') return [];
  return text.split('\n');
}

/**
 * Splits text into real lines for patch generation: unlike {@link splitLines},
 * it drops the artificial trailing empty entry `String#split` leaves behind
 * for a trailing newline, and reports whether the text's last line is
 * missing its own trailing newline.
 * @param {string} text
 * @returns {{lines: string[], noNewlineAtEnd: boolean}}
 */
function splitPatchLines(text) {
  if (text === '') return { lines: [], noNewlineAtEnd: false };
  const lines = text.split('\n');
  const noNewlineAtEnd = lines[lines.length - 1] !== '';
  if (!noNewlineAtEnd) lines.pop();
  return { lines, noNewlineAtEnd };
}

/**
 * Adjusts a line edit script for patch generation only: standard diff/patch
 * tools never treat a file's final line as equal to a same-content line on
 * the other side unless both files actually end it the same way (both with,
 * or both without, a trailing newline). This walks the (already-computed)
 * ops in O(n) and splits the single 'equal' op that would otherwise pair a
 * newline-terminated line with a non-terminated one into an explicit
 * delete+insert, without re-running the O(ND) Myers search.
 * @param {Array<{type: string, aIndex: number, bIndex: number}>} ops
 * @param {number} lastOldIndex
 * @param {number} lastNewIndex
 * @param {boolean} oldNoNewline
 * @param {boolean} newNoNewline
 * @returns {Array<{type: string, aIndex: number, bIndex: number}>}
 */
function patchSafeOps(ops, lastOldIndex, lastNewIndex, oldNoNewline, newNoNewline) {
  if (!oldNoNewline && !newNoNewline) return ops;

  const result = [];
  for (const op of ops) {
    if (op.type === 'equal') {
      const oldUnterminated = oldNoNewline && op.aIndex === lastOldIndex;
      const newUnterminated = newNoNewline && op.bIndex === lastNewIndex;
      if (oldUnterminated !== newUnterminated) {
        result.push({ type: 'delete', aIndex: op.aIndex, bIndex: -1 });
        result.push({ type: 'insert', aIndex: -1, bIndex: op.bIndex });
        continue;
      }
    }
    result.push(op);
  }
  return result;
}

/**
 * Reads a File/Blob's contents as UTF-8 text.
 * @param {File|Blob} file
 * @returns {Promise<string>} Resolves with the file's text contents.
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {string} */ (reader.result));
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.readAsText(file);
  });
}

function commonPrefixLength(a, b) {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

function commonSuffixLength(a, b, prefixLength) {
  const max = Math.min(a.length, b.length) - prefixLength;
  let i = 0;
  while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

/**
 * Maps each unique item to a small integer id so the Myers diff can compare
 * integers instead of (potentially long) strings, which matters once inputs
 * run into the thousands of lines.
 * @param {string[]} items
 * @param {Map<string, number>} table Shared table so both sides use the same ids.
 * @returns {Int32Array}
 */
function internItems(items, table) {
  const ids = new Int32Array(items.length);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let id = table.get(item);
    if (id === undefined) {
      id = table.size;
      table.set(item, id);
    }
    ids[i] = id;
  }
  return ids;
}

/**
 * Builds a fully-disjoint edit script (delete everything, then insert
 * everything) in O(n+m) time/space. Used as a bounded fallback once the
 * true edit distance would exceed {@link MAX_EDIT_DISTANCE}.
 * @param {Int32Array} a
 * @param {Int32Array} b
 * @returns {Array<{type: 'equal'|'delete'|'insert', aIndex: number, bIndex: number}>}
 */
function replaceAllEditScript(a, b) {
  const ops = [];
  for (let i = 0; i < a.length; i++) ops.push({ type: 'delete', aIndex: i, bIndex: -1 });
  for (let j = 0; j < b.length; j++) ops.push({ type: 'insert', aIndex: -1, bIndex: j });
  return ops;
}

/**
 * Runs Myers' O(ND) shortest-edit-script algorithm over two integer arrays.
 * The search (and its O(D^2) trace memory) is capped at {@link MAX_EDIT_DISTANCE}
 * rounds; large, mostly-dissimilar inputs whose true edit distance exceeds
 * that cap fall back to {@link replaceAllEditScript} instead of exhausting memory.
 * @param {Int32Array} a
 * @param {Int32Array} b
 * @returns {Array<{type: 'equal'|'delete'|'insert', aIndex: number, bIndex: number}>}
 */
function myersEditScript(a, b) {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return [];

  const boundedMax = Math.min(max, MAX_EDIT_DISTANCE);
  const offset = boundedMax;
  const v = new Int32Array(2 * boundedMax + 1);
  const trace = [];
  let found = false;

  outer: for (let d = 0; d <= boundedMax; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1];
      } else {
        x = v[offset + k - 1] + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break outer;
      }
    }
  }

  if (!found) return replaceAllEditScript(a, b);

  const ops = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d];
    const k = x - y;
    const prevK =
      k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1]) ? k + 1 : k - 1;
    const prevX = vd[offset + prevK];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      ops.push({ type: 'equal', aIndex: x - 1, bIndex: y - 1 });
      x--;
      y--;
    }

    if (d > 0) {
      if (x === prevX) {
        ops.push({ type: 'insert', aIndex: -1, bIndex: y - 1 });
        y--;
      } else {
        ops.push({ type: 'delete', aIndex: x - 1, bIndex: -1 });
        x--;
      }
    }
  }
  ops.reverse();
  return ops;
}

/**
 * Computes the line-level edit script between two line arrays, trimming the
 * shared prefix/suffix first so large near-identical documents stay fast —
 * the O(ND) Myers pass only runs over the differing middle section.
 * @param {string[]} oldLines
 * @param {string[]} newLines
 * @returns {Array<{type: 'equal'|'delete'|'insert', aIndex: number, bIndex: number}>}
 */
export function computeLineOps(oldLines, newLines) {
  const prefixLength = commonPrefixLength(oldLines, newLines);
  const suffixLength = commonSuffixLength(oldLines, newLines, prefixLength);

  const ops = [];
  for (let i = 0; i < prefixLength; i++) {
    ops.push({ type: 'equal', aIndex: i, bIndex: i });
  }

  const midOld = oldLines.slice(prefixLength, oldLines.length - suffixLength);
  const midNew = newLines.slice(prefixLength, newLines.length - suffixLength);

  const table = new Map();
  const idsOld = internItems(midOld, table);
  const idsNew = internItems(midNew, table);

  for (const op of myersEditScript(idsOld, idsNew)) {
    ops.push({
      type: op.type,
      aIndex: op.aIndex === -1 ? -1 : op.aIndex + prefixLength,
      bIndex: op.bIndex === -1 ? -1 : op.bIndex + prefixLength,
    });
  }

  for (let i = 0; i < suffixLength; i++) {
    ops.push({
      type: 'equal',
      aIndex: oldLines.length - suffixLength + i,
      bIndex: newLines.length - suffixLength + i,
    });
  }

  return ops;
}

/**
 * Splits a line into word / whitespace / punctuation tokens so changes can
 * be highlighted at a finer grain than the whole line.
 * @param {string} line
 * @returns {string[]}
 */
export function tokenizeLine(line) {
  return line.match(TOKEN_PATTERN) ?? [];
}

/**
 * Computes a token-level (word/character) diff between two lines.
 * @param {string} oldLine
 * @param {string} newLine
 * @returns {Array<{type: 'equal'|'delete'|'insert', value: string}>}
 */
export function diffTokens(oldLine, newLine) {
  const oldTokens = tokenizeLine(oldLine);
  const newTokens = tokenizeLine(newLine);
  const table = new Map();
  const idsOld = internItems(oldTokens, table);
  const idsNew = internItems(newTokens, table);

  return myersEditScript(idsOld, idsNew).map((op) => {
    if (op.type === 'equal') return { type: 'equal', value: oldTokens[op.aIndex] };
    if (op.type === 'delete') return { type: 'delete', value: oldTokens[op.aIndex] };
    return { type: 'insert', value: newTokens[op.bIndex] };
  });
}

/**
 * Groups a flat line edit script into display rows. Unchanged lines pass
 * through as-is; adjacent delete/insert runs are paired index-for-index into
 * 'modified' rows (carrying a token diff for inline highlighting), with any
 * leftover lines on either side treated as a pure removal or addition.
 * @param {string[]} oldLines
 * @param {string[]} newLines
 * @param {Array<{type: string, aIndex: number, bIndex: number}>} ops
 * @returns {DiffResult}
 */
export function buildDiffRows(oldLines, newLines, ops) {
  const rows = [];
  const stats = { added: 0, removed: 0, modified: 0, unchanged: 0 };

  let i = 0;
  while (i < ops.length) {
    const op = ops[i];
    if (op.type === 'equal') {
      rows.push({
        type: 'unchanged',
        left: { number: op.aIndex + 1, content: oldLines[op.aIndex] },
        right: { number: op.bIndex + 1, content: newLines[op.bIndex] },
      });
      stats.unchanged++;
      i++;
      continue;
    }

    const deletes = [];
    const inserts = [];
    while (i < ops.length && ops[i].type === 'delete') {
      deletes.push(ops[i]);
      i++;
    }
    while (i < ops.length && ops[i].type === 'insert') {
      inserts.push(ops[i]);
      i++;
    }

    const pairCount = Math.min(deletes.length, inserts.length);
    for (let p = 0; p < pairCount; p++) {
      const left = oldLines[deletes[p].aIndex];
      const right = newLines[inserts[p].bIndex];
      rows.push({
        type: 'modified',
        left: { number: deletes[p].aIndex + 1, content: left },
        right: { number: inserts[p].bIndex + 1, content: right },
        tokens: diffTokens(left, right),
      });
      stats.modified++;
    }
    for (let p = pairCount; p < deletes.length; p++) {
      rows.push({
        type: 'removed',
        left: { number: deletes[p].aIndex + 1, content: oldLines[deletes[p].aIndex] },
        right: null,
      });
      stats.removed++;
    }
    for (let p = pairCount; p < inserts.length; p++) {
      rows.push({
        type: 'added',
        left: null,
        right: { number: inserts[p].bIndex + 1, content: newLines[inserts[p].bIndex] },
      });
      stats.added++;
    }
  }

  return { rows, stats };
}

/**
 * Computes the full line-level diff between two texts, ready for rendering
 * as either a side-by-side or unified view.
 * @param {string} oldText
 * @param {string} newText
 * @returns {DiffResult}
 */
export function diffLines(oldText, newText) {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const ops = computeLineOps(oldLines, newLines);
  return buildDiffRows(oldLines, newLines, ops);
}

/**
 * @typedef {object} UnifiedDiffMeta
 * @property {string} oldLabel
 * @property {string} newLabel
 * @property {number} context
 * @property {boolean} oldNoNewline Whether the old text's last line has no trailing newline.
 * @property {boolean} newNoNewline Whether the new text's last line has no trailing newline.
 */

/**
 * Formats a precomputed line edit script as a standard unified-diff string
 * (as produced by `diff -u`), grouping nearby changes into hunks with
 * surrounding context lines and annotating a missing final trailing newline
 * on either side with a `\ No newline at end of file` marker, so the result
 * is an applicable patch regardless of how either text ends.
 * @param {string[]} oldLines Real lines of the old text (see {@link splitPatchLines}).
 * @param {string[]} newLines Real lines of the new text (see {@link splitPatchLines}).
 * @param {Array<{type: string, aIndex: number, bIndex: number}>} ops
 * @param {UnifiedDiffMeta} meta
 * @returns {string} The unified diff, or an empty string when there are no changes.
 */
function formatUnifiedDiff(oldLines, newLines, ops, meta) {
  const { oldLabel, newLabel, context, oldNoNewline, newNoNewline } = meta;

  const changeIndexes = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].type !== 'equal') changeIndexes.push(i);
  }
  if (changeIndexes.length === 0) return '';

  const groups = [[changeIndexes[0]]];
  for (let i = 1; i < changeIndexes.length; i++) {
    const group = groups[groups.length - 1];
    if (changeIndexes[i] - group[group.length - 1] <= context * 2) {
      group.push(changeIndexes[i]);
    } else {
      groups.push([changeIndexes[i]]);
    }
  }

  const oldCountPrefix = new Array(ops.length + 1).fill(0);
  const newCountPrefix = new Array(ops.length + 1).fill(0);
  for (let i = 0; i < ops.length; i++) {
    oldCountPrefix[i + 1] = oldCountPrefix[i] + (ops[i].aIndex !== -1 ? 1 : 0);
    newCountPrefix[i + 1] = newCountPrefix[i] + (ops[i].bIndex !== -1 ? 1 : 0);
  }

  const output = [`--- ${oldLabel}`, `+++ ${newLabel}`];
  const NO_NEWLINE_MARKER = '\\ No newline at end of file';

  for (const group of groups) {
    const start = Math.max(0, group[0] - context);
    const end = Math.min(ops.length - 1, group[group.length - 1] + context);

    const oldConsumedBefore = oldCountPrefix[start];
    const newConsumedBefore = newCountPrefix[start];
    const oldCount = oldCountPrefix[end + 1] - oldConsumedBefore;
    const newCount = newCountPrefix[end + 1] - newConsumedBefore;
    const oldStart = oldCount > 0 ? oldConsumedBefore + 1 : oldConsumedBefore;
    const newStart = newCount > 0 ? newConsumedBefore + 1 : newConsumedBefore;

    output.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);

    for (let i = start; i <= end; i++) {
      const op = ops[i];
      const isFinalOld = op.aIndex === oldLines.length - 1 && oldNoNewline;
      const isFinalNew = op.bIndex === newLines.length - 1 && newNoNewline;
      if (op.type === 'equal') {
        output.push(` ${oldLines[op.aIndex]}`);
        if (isFinalOld || isFinalNew) output.push(NO_NEWLINE_MARKER);
      } else if (op.type === 'delete') {
        output.push(`-${oldLines[op.aIndex]}`);
        if (isFinalOld) output.push(NO_NEWLINE_MARKER);
      } else {
        output.push(`+${newLines[op.bIndex]}`);
        if (isFinalNew) output.push(NO_NEWLINE_MARKER);
      }
    }
  }

  // A unified diff is itself a line-oriented text file: like `diff -u`'s own
  // output, it always ends with a trailing newline, even when the very last
  // emitted line documents a *content* line that lacks one (the marker
  // above already captures that fact). Omitting it corrupts the patch for
  // `git apply`/`patch`, which parse the file the same way.
  return `${output.join('\n')}\n`;
}

/**
 * Generates a standard unified-diff string (as produced by `diff -u`),
 * grouping nearby changes into hunks with surrounding context lines.
 * @param {string} oldText
 * @param {string} newText
 * @param {{oldLabel?: string, newLabel?: string, context?: number}} [options]
 * @returns {string} The unified diff, or an empty string when the texts are identical.
 */
export function generateUnifiedDiff(oldText, newText, options = {}) {
  const { oldLabel = 'a', newLabel = 'b', context = DEFAULT_CONTEXT } = options;
  const { lines: oldLines, noNewlineAtEnd: oldNoNewline } = splitPatchLines(oldText);
  const { lines: newLines, noNewlineAtEnd: newNoNewline } = splitPatchLines(newText);
  const ops = computeLineOps(oldLines, newLines);
  const patchOps = patchSafeOps(
    ops,
    oldLines.length - 1,
    newLines.length - 1,
    oldNoNewline,
    newNoNewline,
  );
  return formatUnifiedDiff(oldLines, newLines, patchOps, {
    oldLabel,
    newLabel,
    context,
    oldNoNewline,
    newNoNewline,
  });
}

/**
 * Computes both the display diff (rows/stats) and the unified-diff patch
 * text for the same pair of texts, sharing a single Myers computation
 * instead of running it once per output as separate calls would. The
 * display rows use the raw content-only match; the patch text additionally
 * runs through {@link patchSafeOps} so trailing-newline differences never
 * leak into the on-screen comparison, only into the downloadable patch.
 * @param {string} oldText
 * @param {string} newText
 * @param {{oldLabel?: string, newLabel?: string, context?: number}} [options]
 * @returns {DiffResult & {unifiedDiff: string}}
 */
export function computeTextDiff(oldText, newText, options = {}) {
  const { oldLabel = 'a', newLabel = 'b', context = DEFAULT_CONTEXT } = options;
  const { lines: oldLines, noNewlineAtEnd: oldNoNewline } = splitPatchLines(oldText);
  const { lines: newLines, noNewlineAtEnd: newNoNewline } = splitPatchLines(newText);
  const ops = computeLineOps(oldLines, newLines);

  const { rows, stats } = buildDiffRows(oldLines, newLines, ops);
  const patchOps = patchSafeOps(
    ops,
    oldLines.length - 1,
    newLines.length - 1,
    oldNoNewline,
    newNoNewline,
  );
  const unifiedDiff = formatUnifiedDiff(oldLines, newLines, patchOps, {
    oldLabel,
    newLabel,
    context,
    oldNoNewline,
    newNoNewline,
  });

  return { rows, stats, unifiedDiff };
}
