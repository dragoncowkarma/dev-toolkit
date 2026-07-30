const DEFAULT_CONTEXT = 3;
const TOKEN_PATTERN = /\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g;

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
 * Runs Myers' O(ND) shortest-edit-script algorithm over two integer arrays.
 * @param {Int32Array} a
 * @param {Int32Array} b
 * @returns {Array<{type: 'equal'|'delete'|'insert', aIndex: number, bIndex: number}>}
 */
function myersEditScript(a, b) {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return [];

  const offset = max;
  const v = new Int32Array(2 * max + 1);
  const trace = [];

  outer: for (let d = 0; d <= max; d++) {
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
        break outer;
      }
    }
  }

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
 * @returns {{rows: Array<object>, stats: {added: number, removed: number, modified: number, unchanged: number}}}
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
 * @returns {{rows: Array<object>, stats: {added: number, removed: number, modified: number, unchanged: number}}}
 */
export function diffLines(oldText, newText) {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const ops = computeLineOps(oldLines, newLines);
  return buildDiffRows(oldLines, newLines, ops);
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
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const ops = computeLineOps(oldLines, newLines);

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
      if (op.type === 'equal') {
        output.push(` ${oldLines[op.aIndex]}`);
      } else if (op.type === 'delete') {
        output.push(`-${oldLines[op.aIndex]}`);
      } else {
        output.push(`+${newLines[op.bIndex]}`);
      }
    }
  }

  return output.join('\n');
}
