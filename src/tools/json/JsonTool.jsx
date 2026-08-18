import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { validateJson, formatJson, minifyJson } from './json.utils';
import './json.css';

const EDITOR_LINE_HEIGHT = 20;
const TREE_ROW_HEIGHT = 22;
const TREE_INDENT_SIZE = 20;
const VIRTUAL_OVERSCAN = 6;
const DEFAULT_VIEWPORT_HEIGHT = 400;
const EMPTY_EXPANSION_OVERRIDES = new Map();

const SAMPLE_JSON = `{
  "name": "JSON Formatter",
  "version": "1.0.0",
  "active": true,
  "features": [
    "Formatting (2/4 spaces, tabs)",
    "Minification",
    "Real-time Validation",
    "Interactive Tree View"
  ],
  "stats": {
    "stars": 42,
    "forks": 7
  },
  "nullValue": null
}`;

/**
 * Counts text lines without allocating an array proportional to the input size.
 */
function countLines(value) {
  let count = 1;
  let searchFrom = 0;
  let nextNewline = value.indexOf('\n', searchFrom);

  while (nextNewline !== -1) {
    count += 1;
    searchFrom = nextNewline + 1;
    nextNewline = value.indexOf('\n', searchFrom);
  }

  return count;
}

/**
 * Calculates the bounded set of rows required for the current viewport.
 */
function getVirtualRange(itemCount, scrollTop, viewportHeight, rowHeight) {
  const safeItemCount = Math.max(itemCount, 1);
  const firstVisible = Math.floor(scrollTop / rowHeight);
  const lastVisible = Math.ceil((scrollTop + viewportHeight) / rowHeight);
  const start = Math.min(
    Math.max(firstVisible - VIRTUAL_OVERSCAN, 0),
    safeItemCount - 1
  );
  const end = Math.min(
    Math.max(lastVisible + VIRTUAL_OVERSCAN, start + 1),
    safeItemCount
  );

  return { start, end };
}

/**
 * Keeps scroll and resize updates local to a virtualized viewport.
 */
function useVirtualViewport(elementRef) {
  const [viewport, setViewport] = useState({
    height: DEFAULT_VIEWPORT_HEIGHT,
    scrollTop: 0,
  });

  const handleScroll = useCallback((event) => {
    const scrollTop = event.currentTarget.scrollTop;
    setViewport((current) => (
      current.scrollTop === scrollTop ? current : { ...current, scrollTop }
    ));
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;

    const updateHeight = () => {
      const height = element.clientHeight || DEFAULT_VIEWPORT_HEIGHT;
      setViewport((current) => (
        current.height === height ? current : { ...current, height }
      ));
    };

    updateHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateHeight);
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [elementRef]);

  return { ...viewport, handleScroll };
}

/**
 * JSON editor with a line-number gutter bounded to visible rows.
 */
const VirtualizedJsonEditor = memo(function VirtualizedJsonEditor({ value, onChange }) {
  const textareaRef = useRef(null);
  const lineCount = useMemo(() => countLines(value), [value]);
  const {
    height,
    scrollTop,
    handleScroll,
  } = useVirtualViewport(textareaRef);
  const { start, end } = getVirtualRange(
    lineCount,
    scrollTop,
    height,
    EDITOR_LINE_HEIGHT
  );
  const visibleLineNumbers = useMemo(
    () => Array.from({ length: end - start }, (_, index) => start + index + 1),
    [end, start]
  );
  const lineNumberOffset = 12 + (start * EDITOR_LINE_HEIGHT) - scrollTop;

  return (
    <div className="editor-container">
      <div className="line-numbers" aria-hidden="true">
        <div
          className="line-numbers-window"
          style={{ transform: `translateY(${lineNumberOffset}px)` }}
        >
          {visibleLineNumbers.map((lineNumber) => (
            <div key={lineNumber} className="line-number-item">
              {lineNumber}
            </div>
          ))}
        </div>
      </div>
      <textarea
        ref={textareaRef}
        className="editor-textarea"
        placeholder="Paste or type your JSON here..."
        value={value}
        onChange={onChange}
        onScroll={handleScroll}
        aria-label="JSON Input Area"
        spellCheck="false"
      />
    </div>
  );
});

function escapeTreePathSegment(segment) {
  return String(segment).replaceAll('~', '~0').replaceAll('/', '~1');
}

function getStoredExpansion(path, defaultExpanded, overrides) {
  return overrides.has(path) ? overrides.get(path) : defaultExpanded;
}

/**
 * Flattens only expanded JSON branches into lightweight virtual tree rows.
 */
function appendVisibleTreeRows(
  rows,
  value,
  path,
  depth,
  name,
  isLast,
  defaultExpanded,
  overrides
) {
  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);
  const keys = isObject && !isArray ? Object.keys(value) : null;
  const childCount = isArray ? value.length : keys?.length ?? 0;
  const isExpandable = isObject && childCount > 0;
  const expanded = isExpandable
    ? getStoredExpansion(path, defaultExpanded, overrides)
    : false;

  rows.push({
    childCount,
    depth,
    expanded,
    isArray,
    isExpandable,
    isLast,
    kind: 'node',
    name,
    path,
    value,
  });

  if (!expanded) return;

  if (isArray) {
    value.forEach((child, index) => {
      appendVisibleTreeRows(
        rows,
        child,
        `${path}/${index}`,
        depth + 1,
        undefined,
        index === value.length - 1,
        defaultExpanded,
        overrides
      );
    });
  } else {
    keys.forEach((key, index) => {
      appendVisibleTreeRows(
        rows,
        value[key],
        `${path}/${escapeTreePathSegment(key)}`,
        depth + 1,
        key,
        index === keys.length - 1,
        defaultExpanded,
        overrides
      );
    });
  }

  rows.push({
    depth,
    isArray,
    isLast,
    kind: 'closing',
    path: `${path}/~close`,
  });
}

function buildVisibleTreeRows(data, defaultExpanded, overrides) {
  const rows = [];
  appendVisibleTreeRows(
    rows,
    data,
    '$',
    0,
    undefined,
    true,
    defaultExpanded,
    overrides
  );
  return rows;
}

function JsonTreeKey({ name }) {
  if (name === undefined || name === null) return null;
  return <span className="json-tree-key">{JSON.stringify(name)}: </span>;
}

function JsonTreeComma({ isLast }) {
  if (isLast) return null;
  return <span className="json-tree-comma">,</span>;
}

function JsonTreePrimitive({ value }) {
  if (value === null) {
    return <span className="json-tree-value json-tree-null">null</span>;
  }

  const type = typeof value;
  if (type === 'boolean') {
    return (
      <span className="json-tree-value json-tree-boolean">
        {value.toString()}
      </span>
    );
  }
  if (type === 'number') {
    return <span className="json-tree-value json-tree-number">{value}</span>;
  }
  return (
    <span className="json-tree-value json-tree-string">
      {JSON.stringify(value)}
    </span>
  );
}

function JsonTreeRow({ row, onToggle }) {
  const rowStyle = { paddingLeft: `${row.depth * TREE_INDENT_SIZE + 4}px` };
  const endBracket = row.isArray ? ']' : '}';

  if (row.kind === 'closing') {
    return (
      <div className="json-tree-row json-tree-closing-row" style={rowStyle}>
        <span className="json-tree-toggle-spacer" />
        <span className="json-tree-bracket">{endBracket}</span>
        <JsonTreeComma isLast={row.isLast} />
      </div>
    );
  }

  const isObject = row.value !== null && typeof row.value === 'object';
  const startBracket = row.isArray ? '[' : '{';
  const nodeLabel = row.name === undefined ? 'root' : String(row.name);

  return (
    <div
      className="json-tree-row"
      style={rowStyle}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={row.isExpandable ? row.expanded : undefined}
    >
      {row.isExpandable ? (
        <button
          type="button"
          className={`json-tree-toggle ${row.expanded ? 'expanded' : 'collapsed'}`}
          onClick={() => onToggle(row.path)}
          aria-label={`${row.expanded ? 'Collapse' : 'Expand'} ${nodeLabel} node`}
        >
          ▶
        </button>
      ) : (
        <span className="json-tree-toggle-spacer" />
      )}
      <JsonTreeKey name={row.name} />
      {isObject ? (
        <>
          <span className="json-tree-bracket">{startBracket}</span>
          {!row.expanded && row.isExpandable && (
            <span className="json-tree-summary">
              {row.isArray
                ? ` ... ${row.childCount} items `
                : ` ... ${row.childCount} keys `}
            </span>
          )}
          {!row.expanded && <span className="json-tree-bracket">{endBracket}</span>}
        </>
      ) : (
        <JsonTreePrimitive value={row.value} />
      )}
      {(!row.expanded || !row.isExpandable) && (
        <JsonTreeComma isLast={row.isLast} />
      )}
    </div>
  );
}

/**
 * Virtualized JSON tree with path-specific expansion overrides.
 */
const JsonTreeView = memo(function JsonTreeView({ data, expansionCommand }) {
  const containerRef = useRef(null);
  const [expansionState, setExpansionState] = useState({
    commandRevision: expansionCommand.revision,
    defaultExpanded: expansionCommand.expanded,
    overrides: new Map(),
  });
  const commandIsCurrent =
    expansionState.commandRevision === expansionCommand.revision;
  const defaultExpanded = commandIsCurrent
    ? expansionState.defaultExpanded
    : expansionCommand.expanded;
  const overrides = commandIsCurrent
    ? expansionState.overrides
    : EMPTY_EXPANSION_OVERRIDES;
  const rows = useMemo(
    () => buildVisibleTreeRows(data, defaultExpanded, overrides),
    [data, defaultExpanded, overrides]
  );
  const {
    height,
    scrollTop,
    handleScroll,
  } = useVirtualViewport(containerRef);
  const { start, end } = getVirtualRange(
    rows.length,
    scrollTop,
    height,
    TREE_ROW_HEIGHT
  );
  const visibleRows = rows.slice(start, end);

  const togglePath = useCallback((path) => {
    setExpansionState((current) => {
      const isCurrent = current.commandRevision === expansionCommand.revision;
      const baseDefault = isCurrent
        ? current.defaultExpanded
        : expansionCommand.expanded;
      const baseOverrides = isCurrent
        ? current.overrides
        : EMPTY_EXPANSION_OVERRIDES;
      const nextOverrides = new Map(baseOverrides);
      const currentValue = getStoredExpansion(path, baseDefault, baseOverrides);
      nextOverrides.set(path, !currentValue);

      return {
        commandRevision: expansionCommand.revision,
        defaultExpanded: baseDefault,
        overrides: nextOverrides,
      };
    });
  }, [expansionCommand]);

  return (
    <div
      ref={containerRef}
      className="json-tree-container"
      onScroll={handleScroll}
      role="tree"
      aria-label="JSON tree"
    >
      <div
        className="json-tree-virtual-spacer"
        style={{ height: `${rows.length * TREE_ROW_HEIGHT}px` }}
      >
        <div
          className="json-tree-window"
          style={{ transform: `translateY(${start * TREE_ROW_HEIGHT}px)` }}
        >
          {visibleRows.map((row) => (
            <JsonTreeRow key={row.path} row={row} onToggle={togglePath} />
          ))}
        </div>
      </div>
    </div>
  );
});

/**
 * Main JSON Formatter and Validator Tool Component.
 */
export default function JsonTool({ onBack }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [indent, setIndent] = useState('2');
  const [viewMode, setViewMode] = useState('text');
  const [validation, setValidation] = useState({ isValid: true, message: '', snippet: '' });
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);
  const [treeExpansionCommand, setTreeExpansionCommand] = useState({
    expanded: true,
    revision: 0,
  });

  const scheduleToastDismissal = useCallback(() => {
    if (toastTimeoutRef.current !== null) {
      clearTimeout(toastTimeoutRef.current);
    }

    toastTimeoutRef.current = setTimeout(() => {
      toastTimeoutRef.current = null;
      setToast(null);
    }, 3000);
  }, []);

  useEffect(() => () => {
    if (toastTimeoutRef.current !== null) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
  }, []);

  // Perform real-time validation
  useEffect(() => {
    if (!input.trim()) {
      setValidation({ isValid: true, message: '', snippet: '' });
      return;
    }
    const result = validateJson(input);
    setValidation(result);
  }, [input]);

  const handleInputChange = useCallback((e) => {
    setInput(e.target.value);
    setOutput('');
  }, []);

  const handleFormat = () => {
    const result = validateJson(input);
    if (result.isValid) {
      try {
        const formatted = formatJson(input, indent);
        setInput(formatted);
        setOutput(formatted);
      } catch (err) {
        setValidation({ isValid: false, message: err.message, snippet: '' });
      }
    } else {
      setValidation(result);
    }
  };

  const handleMinify = () => {
    const result = validateJson(input);
    if (result.isValid) {
      try {
        const minified = minifyJson(input);
        setInput(minified);
        setOutput(minified);
      } catch (err) {
        setValidation({ isValid: false, message: err.message, snippet: '' });
      }
    } else {
      setValidation(result);
    }
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setValidation({ isValid: true, message: '', snippet: '' });
  };

  const handleLoadSample = () => {
    setInput(SAMPLE_JSON);
    try {
      const formatted = formatJson(SAMPLE_JSON, indent);
      setOutput(formatted);
    } catch {
      // should not happen for static sample
    }
  };

  const handleCopy = () => {
    const textToCopy = viewMode === 'tree'
      ? (validation.isValid && input ? formatJson(input, indent) : '')
      : output || input;
    if (!textToCopy) return;

    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        setToast({ text: 'Copied to clipboard!', type: 'success' });
        scheduleToastDismissal();
      })
      .catch((err) => {
        console.error('Failed to copy: ', err);
        setToast({ text: 'Failed to copy to clipboard.', type: 'error' });
        scheduleToastDismissal();
      });
  };

  const handleDownload = () => {
    const textToDownload = viewMode === 'tree'
      ? (validation.isValid && input ? formatJson(input, indent) : '')
      : output || input;
    if (!textToDownload) return;

    const blob = new Blob([textToDownload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'data.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const toggleTreeExpansion = (expand) => {
    setTreeExpansionCommand((current) => ({
      expanded: expand,
      revision: current.revision + 1,
    }));
  };

  const parsedData = useMemo(() => {
    if (!validation.isValid || !input.trim()) return null;

    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }, [input, validation.isValid]);

  // Guards against the render that happens after input changes but before the
  // validation effect catches up, where validation.isValid can still be stale.
  let formattedOutputText = output;
  if (!formattedOutputText && input.trim()) {
    try {
      formattedOutputText = formatJson(input, indent);
    } catch {
      formattedOutputText = '';
    }
  }

  return (
    <section className="json-tool-container" aria-label="JSON Utility Tool">
      {toast && (
        <div className="toast" role="status">
          <span aria-hidden="true">{toast.type === 'error' ? '❌' : '✅'}</span> {toast.text}
        </div>
      )}

      <div className="tool-header-row">
        <div className="tool-title-group">
          <button className="back-button" onClick={onBack} aria-label="Go back to tool dashboard">
            <span>←</span> Back
          </button>
          <h2 className="tool-title">JSON Formatter & Validator</h2>
        </div>
        <div className="panel-actions">
          <button className="btn" onClick={handleLoadSample} aria-label="Load sample JSON">
            📋 Load Sample
          </button>
          <button className="btn" onClick={handleClear} aria-label="Clear inputs">
            🗑️ Clear
          </button>
        </div>
      </div>

      <div className="json-workspace-grid">
        {/* Input Panel */}
        <div className="json-panel">
          <div className="panel-header">
            <h3 className="panel-title">
              Input JSON
              {input.trim() === '' ? (
                <span className="status-badge empty">Empty</span>
              ) : validation.isValid ? (
                <span className="status-badge valid">Valid</span>
              ) : (
                <span className="status-badge invalid">Invalid</span>
              )}
            </h3>
            <div className="panel-actions">
              <label 
                htmlFor="indent-select" 
                style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}
              >
                Indent:
              </label>
              <select 
                id="indent-select"
                className="select-input" 
                value={indent} 
                onChange={(e) => {
                  setIndent(e.target.value);
                  setOutput('');
                }}
                aria-label="Indent size"
              >
                <option value="2">2 Spaces</option>
                <option value="4">4 Spaces</option>
                <option value="tab">Tabs</option>
              </select>
              <button 
                className="btn btn-primary" 
                onClick={handleFormat} 
                disabled={!validation.isValid || !input.trim()}
                aria-label="Format JSON"
              >
                Format
              </button>
              <button 
                className="btn" 
                onClick={handleMinify} 
                disabled={!validation.isValid || !input.trim()}
                aria-label="Minify JSON"
              >
                Minify
              </button>
            </div>
          </div>

          <VirtualizedJsonEditor value={input} onChange={handleInputChange} />
        </div>

        {/* Output Panel */}
        <div className="json-panel">
          <div className="panel-header">
            <h3 className="panel-title">Output</h3>
            <div className="panel-actions">
              <div className="tab-group" role="tablist" aria-label="Output view modes">
                <button 
                  className={`tab-btn ${viewMode === 'text' ? 'active' : ''}`}
                  onClick={() => setViewMode('text')}
                  role="tab"
                  aria-selected={viewMode === 'text'}
                >
                  Text View
                </button>
                <button 
                  className={`tab-btn ${viewMode === 'tree' ? 'active' : ''}`}
                  onClick={() => setViewMode('tree')}
                  role="tab"
                  aria-selected={viewMode === 'tree'}
                  disabled={!validation.isValid || !input.trim()}
                >
                  Tree View
                </button>
              </div>
              <button 
                className="btn" 
                onClick={handleCopy} 
                disabled={!input.trim() || (!validation.isValid && viewMode === 'tree')}
                aria-label="Copy output to clipboard"
              >
                📋 Copy
              </button>
              <button 
                className="btn" 
                onClick={handleDownload} 
                disabled={!input.trim() || (!validation.isValid && viewMode === 'tree')}
                aria-label="Download output as file"
              >
                💾 Download
              </button>
            </div>
          </div>

          {viewMode === 'tree' && validation.isValid && parsedData !== null ? (
            <>
              <div className="tree-actions-toolbar">
                <button 
                  className="btn" 
                  onClick={() => toggleTreeExpansion(true)} 
                  aria-label="Expand all nodes"
                >
                  ➕ Expand All
                </button>
                <button 
                  className="btn" 
                  onClick={() => toggleTreeExpansion(false)} 
                  aria-label="Collapse all nodes"
                >
                  ➖ Collapse All
                </button>
              </div>
              <div className="output-container tree-output-container">
                <div className="json-tree-wrapper">
                  <JsonTreeView
                    data={parsedData}
                    expansionCommand={treeExpansionCommand}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="output-container">
              {validation.isValid ? (
                <pre style={{ 
                  margin: 0, 
                  fontFamily: 'inherit', 
                  fontSize: 'inherit', 
                  color: 'inherit', 
                  whiteSpace: 'pre-wrap', 
                  wordBreak: 'break-all' 
                }}>
                  {formattedOutputText}
                </pre>
              ) : (
                <div className="error-snippet-container" role="alert">
                  <div className="error-message">
                    ❌ JSON Parse Error:
                  </div>
                  <div style={{ color: 'var(--color-text)', marginBottom: '1rem' }}>
                    {validation.message}
                  </div>
                  {validation.snippet && (
                    <pre style={{ 
                      margin: 0, 
                      fontFamily: 'inherit', 
                      color: 'var(--color-error-light)' 
                    }}>
                      {validation.snippet}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
