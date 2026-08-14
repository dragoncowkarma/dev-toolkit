const UNICODE_SYMBOLS = {
  branch: '├── ',
  lastBranch: '└── ',
  vertical: '│   ',
  space: '    ',
};

const ASCII_SYMBOLS = {
  branch: '|-- ',
  lastBranch: '`-- ',
  vertical: '|   ',
  space: '    ',
};

/**
 * A directory or file in a tree.
 * @typedef {object} TreeNode
 * @property {string} name The display name without a trailing slash.
 * @property {'directory'|'file'} type The node type.
 * @property {TreeNode[]} children Child nodes.
 */

/**
 * Creates an empty root node used internally by the tree functions.
 * @returns {TreeNode} A root directory node.
 */
function createRoot() {
  return { name: '', type: 'directory', children: [] };
}

/**
 * Creates a safe, normalized relative path from user input.
 * @param {string} rawPath A slash- or backslash-separated relative path.
 * @returns {{parts: string[], isDirectory: boolean}} Normalized path details.
 * @throws {Error} When the path is malformed or not relative.
 */
export function normalizePath(rawPath) {
  if (typeof rawPath !== 'string') {
    throw new TypeError('Each path must be a string.');
  }

  const source = rawPath.trim().replaceAll('\\', '/');
  if (!source) throw new Error('A path cannot be empty.');
  if (source.startsWith('/') || /^[a-z]:\//i.test(source)) {
    throw new Error(`Only relative paths are supported: ${rawPath}`);
  }

  const isDirectory = source.endsWith('/');
  const parts = source.replace(/^\.\//, '').replace(/\/+$/, '').split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid path segment in: ${rawPath}`);
  }

  return { parts, isDirectory };
}

/**
 * Tests whether a leaf name conventionally represents a file.
 * @param {string} name A path segment.
 * @returns {boolean} Whether the segment is file-like.
 */
function isFileName(name) {
  return name.length > 1 && name.includes('.') && !name.endsWith('.');
}

/**
 * Gets or creates a child node with the given name.
 * @param {TreeNode} parent Parent node.
 * @param {string} name Child name.
 * @param {'directory'|'file'} type Child type.
 * @returns {TreeNode} The matching child.
 */
function upsertChild(parent, name, type) {
  const existing = parent.children.find((child) => child.name === name);
  if (existing) {
    if (type === 'directory') existing.type = 'directory';
    return existing;
  }

  const child = { name, type, children: [] };
  parent.children.push(child);
  return child;
}

/**
 * Adds one normalized path to a root node.
 * @param {TreeNode} root Destination root node.
 * @param {{parts: string[], isDirectory: boolean}} path Normalized path.
 * @returns {void}
 */
function addPath(root, path) {
  let current = root;
  path.parts.forEach((part, index) => {
    const isLeaf = index === path.parts.length - 1;
    const type = isLeaf && !path.isDirectory && isFileName(part) ? 'file' : 'directory';
    current = upsertChild(current, part, type);
  });
}

/**
 * Returns non-empty lines and determines whether their hierarchy is indentation-based.
 * @param {string} text Source text.
 * @returns {{lines: string[], isIndented: boolean}} Input analysis.
 */
function analyzeInput(text) {
  if (typeof text !== 'string') throw new TypeError('Input must be a string.');
  const lines = text.replaceAll('\r\n', '\n').split('\n').filter((line) => line.trim());
  return { lines, isIndented: lines.some((line) => /^[\t ]+\S/.test(line)) };
}

/**
 * Converts a source indentation prefix to a nesting depth.
 * @param {string} whitespace Leading spaces and tabs.
 * @param {number|null} indentWidth Established space indentation width.
 * @returns {{depth: number, indentWidth: number|null}} Parsed depth and width.
 * @throws {Error} When spaces and tabs are mixed or indentation is inconsistent.
 */
function indentationDepth(whitespace, indentWidth) {
  if (!whitespace) return { depth: 0, indentWidth };
  if (whitespace.includes('\t') && whitespace.includes(' ')) {
    throw new Error('Do not mix tabs and spaces in indentation.');
  }
  if (whitespace.includes('\t')) return { depth: whitespace.length, indentWidth };

  const width = indentWidth ?? whitespace.length;
  if (whitespace.length % width !== 0) {
    throw new Error('Use a consistent number of spaces for each indentation level.');
  }
  return { depth: whitespace.length / width, indentWidth: width };
}

/**
 * Parses an indented text list into a tree.
 * @param {string[]} lines Non-empty source lines.
 * @returns {TreeNode} A root node containing the parsed hierarchy.
 * @throws {Error} When nesting skips a parent or indentation is inconsistent.
 */
function parseIndentedLines(lines) {
  const root = createRoot();
  const stack = [root];
  let indentWidth = null;

  lines.forEach((line) => {
    const whitespace = line.match(/^[\t ]*/)[0];
    const indentation = indentationDepth(whitespace, indentWidth);
    indentWidth = indentation.indentWidth;
    const depth = indentation.depth;
    const path = normalizePath(line.trim());
    if (path.parts.length !== 1) {
      throw new Error('Indented entries must contain one name, not a path.');
    }
    if (depth >= stack.length) {
      throw new Error(`Missing parent for indented entry: ${path.parts[0]}`);
    }

    stack.length = depth + 1;
    const parent = stack[depth];
    const type = path.isDirectory || !isFileName(path.parts[0]) ? 'directory' : 'file';
    const node = upsertChild(parent, path.parts[0], type);
    stack[depth + 1] = node;
  });

  return root;
}

/**
 * Parses newline-separated paths or an indented list into a hierarchical tree.
 * A trailing slash explicitly marks a directory; extension-like leaf names are files.
 * @param {string} input Newline-separated relative paths or indented names.
 * @returns {TreeNode} A synthetic root node containing parsed children.
 * @throws {Error} When input contains invalid paths or malformed indentation.
 */
export function parseTreeInput(input) {
  const { lines, isIndented } = analyzeInput(input);
  if (!lines.length) return createRoot();
  if (isIndented) return parseIndentedLines(lines);

  const root = createRoot();
  lines.forEach((line) => addPath(root, normalizePath(line)));
  return root;
}

/**
 * Resolves a rendering symbol set, allowing every compact mode symbol to be overridden.
 * @param {'unicode'|'ascii'|'custom'} mode Built-in symbol mode.
 * @param {Partial<typeof UNICODE_SYMBOLS>} [customSymbols] Optional custom symbols.
 * @returns {typeof UNICODE_SYMBOLS} Complete renderer symbols.
 */
export function getTreeSymbols(mode = 'unicode', customSymbols = {}) {
  const base = mode === 'ascii' ? ASCII_SYMBOLS : UNICODE_SYMBOLS;
  if (mode !== 'unicode' && mode !== 'ascii' && mode !== 'custom') {
    throw new Error(`Unknown tree style: ${mode}`);
  }
  const symbols = { ...base, ...customSymbols };
  if (Object.values(symbols).some((symbol) => typeof symbol !== 'string')) {
    throw new TypeError('Tree symbols must be strings.');
  }
  return symbols;
}

/**
 * Sorts child nodes without changing their source tree.
 * @param {TreeNode[]} children Nodes to order.
 * @param {boolean} foldersFirst Whether directories precede files.
 * @returns {TreeNode[]} Ordered copy of the child list.
 */
function sortChildren(children, foldersFirst) {
  return [...children].sort((left, right) => {
    if (foldersFirst && left.type !== right.type) return left.type === 'directory' ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}

/**
 * Renders a hierarchy as an ASCII or Unicode directory tree.
 * @param {TreeNode} root A root created by {@link parseTreeInput}.
 * @param {object} [options] Rendering options.
 * @param {'unicode'|'ascii'|'custom'} [options.mode='unicode'] Symbol mode.
 * @param {Partial<typeof UNICODE_SYMBOLS>} [options.customSymbols] Symbol overrides.
 * @param {boolean} [options.foldersFirst=true] Sort directories before files.
 * @param {boolean} [options.showRoot=false] Include a root header.
 * @param {string} [options.rootName='project'] Root header label.
 * @param {boolean} [options.trailingSlashes=true] Suffix directories with `/`.
 * @returns {string} The rendered tree, or an empty string for an empty tree.
 */
export function renderTree(root, options = {}) {
  if (!root || !Array.isArray(root.children)) throw new TypeError('A valid root tree is required.');
  const settings = {
    mode: 'unicode',
    customSymbols: {},
    foldersFirst: true,
    showRoot: false,
    rootName: 'project',
    trailingSlashes: true,
    ...options,
  };
  const symbols = getTreeSymbols(settings.mode, settings.customSymbols);
  const lines = [];
  if (settings.showRoot) lines.push(settings.rootName.replace(/\/+$/, '') || 'project');

  function visit(children, prefix) {
    const ordered = sortChildren(children, settings.foldersFirst);
    ordered.forEach((node, index) => {
      const isLast = index === ordered.length - 1;
      const label = node.type === 'directory' && settings.trailingSlashes
        ? `${node.name}/`
        : node.name;
      lines.push(`${prefix}${isLast ? symbols.lastBranch : symbols.branch}${label}`);
      if (node.children.length) {
        visit(node.children, `${prefix}${isLast ? symbols.space : symbols.vertical}`);
      }
    });
  }

  visit(root.children, '');
  return lines.join('\n');
}

/**
 * Parses one tree branch line into its depth and node label.
 * @param {string} line A non-empty line from a tree diagram.
 * @returns {{depth: number, name: string, isDirectory: boolean}|null} Branch details.
 * @throws {Error} When a branch prefix is malformed.
 */
function parseTreeBranch(line) {
  let rest = line;
  let depth = 0;
  while (rest.startsWith('│   ') || rest.startsWith('|   ') || rest.startsWith('    ')) {
    rest = rest.slice(4);
    depth += 1;
  }
  const branchSymbols = ['├── ', '└── ', '|-- ', '`-- '];
  const branch = branchSymbols.find((symbol) => rest.startsWith(symbol));
  if (!branch) return null;
  const rawName = rest.slice(branch.length).trim();
  if (!rawName) throw new Error('Tree entries must have a name.');
  const normalized = normalizePath(rawName);
  if (normalized.parts.length !== 1) {
    throw new Error(`Tree entries must be single names: ${rawName}`);
  }
  return { depth, name: normalized.parts[0], isDirectory: normalized.isDirectory };
}

/**
 * Parses an existing ASCII or Unicode tree diagram into a hierarchy.
 * A first line without tree syntax is treated as an optional root header.
 * @param {string} treeText An ASCII or Unicode tree diagram.
 * @returns {TreeNode} A synthetic root node containing parsed children.
 * @throws {Error} When the diagram has invalid branch structure.
 */
export function parseTreeDiagram(treeText) {
  if (typeof treeText !== 'string') throw new TypeError('Tree text must be a string.');
  const lines = treeText.replaceAll('\r\n', '\n').split('\n').filter((line) => line.trim());
  const root = createRoot();
  if (!lines.length) return root;

  const firstBranch = parseTreeBranch(lines[0]);
  // Indentation and branch characters indicate an attempted tree entry, not a header.
  const hasTreeSyntaxPrefix = /^[\s│├└|`]/u.test(lines[0]);
  const branchLines = firstBranch || hasTreeSyntaxPrefix ? lines : lines.slice(1);
  if (!branchLines.length) return root;

  const stack = [root];
  branchLines.forEach((line) => {
    const entry = parseTreeBranch(line);
    if (!entry) throw new Error(`Malformed tree line: ${line}`);
    if (entry.depth >= stack.length) {
      throw new Error(`Missing parent for tree entry: ${entry.name}`);
    }
    stack.length = entry.depth + 1;
    const node = upsertChild(
      stack[entry.depth],
      entry.name,
      entry.isDirectory || !isFileName(entry.name) ? 'directory' : 'file'
    );
    stack[entry.depth + 1] = node;
  });

  function markParentsAsDirectories(node) {
    if (node.children.length) node.type = 'directory';
    node.children.forEach(markParentsAsDirectories);
  }
  markParentsAsDirectories(root);
  return root;
}

/**
 * Flattens a hierarchy into normalized relative paths, keeping directories explicit.
 * @param {TreeNode} root A root tree.
 * @returns {string[]} Relative paths, with directories ending in `/`.
 */
export function treeToPaths(root) {
  if (!root || !Array.isArray(root.children)) throw new TypeError('A valid root tree is required.');
  const paths = [];
  function visit(node, parentPath) {
    node.children.forEach((child) => {
      const path = `${parentPath}${child.name}`;
      paths.push(child.type === 'directory' ? `${path}/` : path);
      visit(child, `${path}/`);
    });
  }
  visit(root, '');
  return paths;
}

/**
 * Converts a tree into a serializable JSON-friendly object.
 * @param {TreeNode} root A root tree.
 * @returns {TreeNode[]} Deep-copied root children.
 */
export function treeToJson(root) {
  if (!root || !Array.isArray(root.children)) throw new TypeError('A valid root tree is required.');
  return root.children.map((node) => ({
    name: node.name,
    type: node.type,
    children: treeToJson(node),
  }));
}
