import { useEffect, useMemo, useState } from 'react';
import {
  parseTreeDiagram,
  parseTreeInput,
  renderTree,
  treeToJson,
  treeToPaths,
} from './tree.utils.js';
import './ascii-tree.css';

const PRESETS = {
  react: {
    label: 'React app',
    value: [
      'src/components/Button.jsx', 'src/components/Header.jsx', 'src/App.jsx',
      'src/main.jsx', 'public/favicon.svg', 'package.json', 'README.md',
    ].join('\n'),
  },
  monorepo: {
    label: 'Monorepo',
    value: [
      'apps/web/src/main.tsx', 'apps/api/src/server.ts', 'packages/ui/Button.tsx',
      'packages/config/index.js', 'package.json', 'pnpm-workspace.yaml',
    ].join('\n'),
  },
  python: {
    label: 'Python package',
    value: [
      'src/example_package/__init__.py', 'src/example_package/client.py',
      'tests/test_client.py', 'pyproject.toml', 'README.md',
    ].join('\n'),
  },
};

const TREE_SAMPLE = `project
├── src/
│   ├── components/
│   │   └── Button.jsx
│   └── main.jsx
└── README.md`;

function calculateGeneration(input, options) {
  if (!input.trim()) return { output: '', error: '' };
  try {
    return { output: renderTree(parseTreeInput(input), options), error: '' };
  } catch (error) {
    return { output: '', error: error.message };
  }
}

function calculateParsing(input, format) {
  if (!input.trim()) return { output: '', error: '' };
  try {
    const tree = parseTreeDiagram(input);
    const output = format === 'json'
      ? JSON.stringify(treeToJson(tree), null, 2)
      : treeToPaths(tree).join('\n');
    return { output, error: '' };
  } catch (error) {
    return { output: '', error: error.message };
  }
}

/**
 * Provides live generation and reverse parsing for text directory trees.
 * @returns {React.JSX.Element} The ASCII Tree Generator tool.
 */
export default function AsciiTreeTool() {
  const [activeTab, setActiveTab] = useState('generate');
  const [source, setSource] = useState(PRESETS.react.value);
  const [treeText, setTreeText] = useState(TREE_SAMPLE);
  const [parseFormat, setParseFormat] = useState('paths');
  const [copyStatus, setCopyStatus] = useState('');
  const [options, setOptions] = useState({
    mode: 'unicode',
    foldersFirst: true,
    showRoot: true,
    rootName: 'project',
    trailingSlashes: true,
    customSymbols: {
      branch: '+-- ', lastBranch: '`-- ', vertical: '|   ', space: '    ',
    },
  });

  const generated = useMemo(() => calculateGeneration(source, options), [source, options]);
  const parsed = useMemo(() => calculateParsing(treeText, parseFormat), [treeText, parseFormat]);
  const currentResult = activeTab === 'generate' ? generated : parsed;

  useEffect(() => {
    if (!copyStatus) return undefined;
    const timeout = setTimeout(() => setCopyStatus(''), 1800);
    return () => clearTimeout(timeout);
  }, [copyStatus]);

  function updateOption(name, value) {
    setOptions((current) => ({ ...current, [name]: value }));
  }

  function updateSymbol(name, value) {
    setOptions((current) => ({
      ...current,
      customSymbols: { ...current.customSymbols, [name]: value },
    }));
  }

  function loadPreset(event) {
    const preset = PRESETS[event.target.value];
    if (preset) setSource(preset.value);
  }

  async function copyResult() {
    if (!currentResult.output) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(currentResult.output);
      setCopyStatus('Tree output copied to clipboard.');
    } catch {
      setCopyStatus('Could not copy the tree output.');
    }
  }

  return (
    <section className="ascii-tree" aria-label="ASCII Tree Generator">
      <header className="ascii-tree__header">
        <div>
          <p className="ascii-tree__eyebrow">Text</p>
          <h2>ASCII Tree Generator</h2>
          <p>Turn paths into clean directory trees, or recover paths from an existing diagram.</p>
        </div>
        <button type="button" className="ascii-tree__copy" onClick={copyResult}
          disabled={!currentResult.output}>
          Copy output
        </button>
      </header>

      <p className="sr-only" role="status" aria-live="polite">{copyStatus}</p>

      <div className="ascii-tree__tabs" role="tablist" aria-label="Tree conversion mode">
        <button type="button" role="tab" aria-selected={activeTab === 'generate'}
          className={activeTab === 'generate' ? 'is-active' : ''}
          onClick={() => setActiveTab('generate')}>
          Generate Tree
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'parse'}
          className={activeTab === 'parse' ? 'is-active' : ''}
          onClick={() => setActiveTab('parse')}>
          Parse Tree
        </button>
      </div>

      {activeTab === 'generate' ? (
        <div className="ascii-tree__content">
          <div className="ascii-tree__controls">
            <label htmlFor="ascii-tree-preset">Sample preset
              <select id="ascii-tree-preset" onChange={loadPreset} defaultValue="react">
                {Object.entries(PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>{preset.label}</option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>Tree style</legend>
              {['unicode', 'ascii', 'custom'].map((mode) => (
                <label key={mode} className="ascii-tree__choice">
                  <input type="radio" name="tree-style" value={mode} checked={options.mode === mode}
                    onChange={(event) => updateOption('mode', event.target.value)} />
                  {mode[0].toUpperCase() + mode.slice(1)}
                </label>
              ))}
            </fieldset>
            <div className="ascii-tree__toggles">
              <label>
                <input type="checkbox" checked={options.foldersFirst}
                  onChange={(event) => updateOption('foldersFirst', event.target.checked)} />
                Folders first
              </label>
              <label>
                <input type="checkbox" checked={options.showRoot}
                  onChange={(event) => updateOption('showRoot', event.target.checked)} />
                Show root header
              </label>
              <label>
                <input type="checkbox" checked={options.trailingSlashes}
                  onChange={(event) => updateOption('trailingSlashes', event.target.checked)} />
                Directory slashes
              </label>
            </div>
            {options.showRoot && <label htmlFor="ascii-tree-root">Root header
              <input id="ascii-tree-root" value={options.rootName}
                onChange={(event) => updateOption('rootName', event.target.value)} />
            </label>}
            {options.mode === 'custom' && <div className="ascii-tree__symbols">
              {Object.entries(options.customSymbols).map(([name, value]) => (
                <label key={name} htmlFor={`ascii-tree-${name}`}>{name}
                  <input id={`ascii-tree-${name}`} value={value}
                    onChange={(event) => updateSymbol(name, event.target.value)} />
                </label>
              ))}
            </div>}
          </div>
          <div className="ascii-tree__panes">
            <label className="ascii-tree__pane" htmlFor="ascii-tree-source">
              <span>Paths or indented list</span>
              <textarea id="ascii-tree-source" value={source}
                onChange={(event) => setSource(event.target.value)} spellCheck="false"
                placeholder="src/components/Button.jsx\nsrc/main.jsx" />
            </label>
            <OutputPane title="Generated tree" result={generated} />
          </div>
        </div>
      ) : (
        <div className="ascii-tree__content ascii-tree__content--parse">
          <div className="ascii-tree__parse-controls">
            <label>
              <input type="radio" name="parse-format" value="paths"
                checked={parseFormat === 'paths'}
                onChange={(event) => setParseFormat(event.target.value)} />
              Path list
            </label>
            <label>
              <input type="radio" name="parse-format" value="json"
                checked={parseFormat === 'json'}
                onChange={(event) => setParseFormat(event.target.value)} />
              JSON tree
            </label>
          </div>
          <div className="ascii-tree__panes">
            <label className="ascii-tree__pane" htmlFor="ascii-tree-diagram">
              <span>ASCII or Unicode tree</span>
              <textarea id="ascii-tree-diagram" value={treeText}
                onChange={(event) => setTreeText(event.target.value)} spellCheck="false" />
            </label>
            <OutputPane title={parseFormat === 'json' ? 'JSON tree' : 'Normalized paths'}
              result={parsed} />
          </div>
        </div>
      )}
    </section>
  );
}

function OutputPane({ title, result }) {
  return (
    <section className="ascii-tree__pane" aria-label={title}>
      <span>{title}</span>
      {result.error ? <p className="ascii-tree__error" role="alert">{result.error}</p> : (
        <pre className="ascii-tree__output">{result.output || 'Your result will appear here.'}</pre>
      )}
    </section>
  );
}
