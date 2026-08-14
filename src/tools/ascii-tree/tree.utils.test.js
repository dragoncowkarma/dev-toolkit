import { describe, expect, it } from 'vitest';
import {
  getTreeSymbols,
  normalizePath,
  parseTreeDiagram,
  parseTreeInput,
  renderTree,
  treeToJson,
  treeToPaths,
} from './tree.utils.js';

describe('normalizePath', () => {
  it('normalizes relative slash and backslash paths', () => {
    expect(normalizePath('./src\\components/Button.jsx')).toEqual({
      parts: ['src', 'components', 'Button.jsx'],
      isDirectory: false,
    });
  });

  it('rejects empty, absolute, and traversal paths', () => {
    expect(() => normalizePath('')).toThrow('cannot be empty');
    expect(() => normalizePath('/etc/passwd')).toThrow('Only relative');
    expect(() => normalizePath('src/../secret.js')).toThrow('Invalid path segment');
  });
});

describe('parseTreeInput', () => {
  it('creates a hierarchy from paths and recognizes explicit directories', () => {
    const tree = parseTreeInput('src/\nsrc/main.jsx\nREADME.md');
    expect(treeToPaths(tree)).toEqual(['src/', 'src/main.jsx', 'README.md']);
  });

  it('creates a hierarchy from consistently indented names', () => {
    const tree = parseTreeInput('src/\n  components/\n    Button.jsx\n  main.jsx');
    expect(treeToPaths(tree)).toEqual([
      'src/',
      'src/components/',
      'src/components/Button.jsx',
      'src/main.jsx',
    ]);
  });

  it('rejects skipped levels, mixed whitespace, and paths inside indented lists', () => {
    expect(() => parseTreeInput('src/\n  components/\n      Button.jsx')).toThrow('Missing parent');
    expect(() => parseTreeInput('src/\n \tButton.jsx')).toThrow('Do not mix');
    expect(() => parseTreeInput('src/\n  nested/Button.jsx')).toThrow('one name');
  });
});

describe('renderTree', () => {
  const tree = parseTreeInput([
    'README.md', 'src/main.jsx', 'src/components/Button.jsx', 'package.json',
  ].join('\n'));

  it('renders default Unicode branches, folders first, and directory slashes', () => {
    expect(renderTree(tree)).toBe([
      '├── src/',
      '│   ├── components/',
      '│   │   └── Button.jsx',
      '│   └── main.jsx',
      '├── package.json',
      '└── README.md',
    ].join('\n'));
  });

  it('renders ASCII symbols, a root header, and optional no-slash labels', () => {
    expect(renderTree(tree, {
      mode: 'ascii',
      showRoot: true,
      rootName: 'client',
      trailingSlashes: false,
    })).toContain('client\n|-- src\n|   |-- components');
  });

  it('uses the configured custom symbols for each branch position', () => {
    expect(renderTree(parseTreeInput('z.js\na.js'), {
      mode: 'custom',
      foldersFirst: false,
      customSymbols: { branch: '+ ', lastBranch: '- ', vertical: '> ', space: '  ' },
    })).toBe('+ a.js\n- z.js');
  });

  it('returns symbols and rejects invalid symbol modes', () => {
    expect(getTreeSymbols('ascii')).toEqual({
      branch: '|-- ', lastBranch: '`-- ', vertical: '|   ', space: '    ',
    });
    expect(() => getTreeSymbols('emoji')).toThrow('Unknown tree style');
  });
});

describe('parseTreeDiagram', () => {
  it('rejects a malformed first branch line instead of treating it as a root header', () => {
    expect(() => parseTreeDiagram('├──src\n├── main.js\n└── README.md'))
      .toThrow('Malformed tree line: ├──src');
  });

  it('accepts a plain-text root header', () => {
    const tree = parseTreeDiagram('project\n└── README.md');
    expect(treeToPaths(tree)).toEqual(['README.md']);
  });

  it('round-trips a Unicode diagram with an optional root header', () => {
    const original = parseTreeInput('src/components/Button.jsx\nsrc/main.jsx\nREADME.md');
    const diagram = renderTree(original, { showRoot: true, rootName: 'project' });
    expect(treeToPaths(parseTreeDiagram(diagram))).toEqual(treeToPaths(original));
  });

  it('parses ASCII diagrams and marks parents as directories', () => {
    const tree = parseTreeDiagram('project\n|-- src\n|   `-- main.js\n`-- README.md');
    expect(treeToPaths(tree)).toEqual(['src/', 'src/main.js', 'README.md']);
  });

  it('rejects malformed tree lines and skipped nesting', () => {
    expect(() => parseTreeDiagram('project\nnot a branch')).toThrow('Malformed tree line');
    expect(() => parseTreeDiagram('    `-- orphan.js')).toThrow('Missing parent');
  });
});

describe('treeToJson', () => {
  it('returns a serializable deep copy without the synthetic root', () => {
    const json = treeToJson(parseTreeInput('src/main.js'));
    expect(json).toEqual([{
      name: 'src',
      type: 'directory',
      children: [{ name: 'main.js', type: 'file', children: [] }],
    }]);
    json[0].children[0].name = 'changed.js';
    expect(treeToPaths(parseTreeInput('src/main.js'))).toContain('src/main.js');
  });
});
