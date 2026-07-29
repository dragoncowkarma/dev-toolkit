import React, { useState, useEffect, useRef } from 'react';
import { validateJson, formatJson, minifyJson } from './json.utils';
import './json.css';

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
 * Individual Node in the JSON tree visualization.
 */
function JsonNode({ name, value, isLast, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Sync expanded state with defaultExpanded if reset from parent key changes
  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  const toggleExpand = (e) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const renderKey = () => {
    if (name === undefined || name === null) return null;
    return <span className="json-tree-key">"{name}": </span>;
  };

  const renderComma = () => !isLast && <span className="json-tree-comma">,</span>;

  if (value === null) {
    return (
      <div className="json-tree-node">
        {renderKey()}
        <span className="json-tree-value json-tree-null">null</span>
        {renderComma()}
      </div>
    );
  }

  const type = typeof value;

  if (type === 'boolean') {
    return (
      <div className="json-tree-node">
        {renderKey()}
        <span className="json-tree-value json-tree-boolean">{value.toString()}</span>
        {renderComma()}
      </div>
    );
  }

  if (type === 'number') {
    return (
      <div className="json-tree-node">
        {renderKey()}
        <span className="json-tree-value json-tree-number">{value}</span>
        {renderComma()}
      </div>
    );
  }

  if (type === 'string') {
    return (
      <div className="json-tree-node">
        {renderKey()}
        <span className="json-tree-value json-tree-string">"{value}"</span>
        {renderComma()}
      </div>
    );
  }

  // Handle Object or Array
  const isArray = Array.isArray(value);
  const keys = isArray ? value : Object.keys(value);
  const isEmpty = keys.length === 0;

  const startBracket = isArray ? '[' : '{';
  const endBracket = isArray ? ']' : '}';

  if (isEmpty) {
    return (
      <div className="json-tree-node">
        {renderKey()}
        <span className="json-tree-bracket">{startBracket + endBracket}</span>
        {renderComma()}
      </div>
    );
  }

  return (
    <div className="json-tree-node json-tree-expandable">
      <span 
        className={`json-tree-toggle ${expanded ? 'expanded' : 'collapsed'}`} 
        onClick={toggleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleExpand(e);
          }
        }}
        aria-label={expanded ? 'Collapse node' : 'Expand node'}
      >
        ▶
      </span>
      {renderKey()}
      <span className="json-tree-bracket">{startBracket}</span>
      
      {!expanded && (
        <span 
          className="json-tree-summary" 
          onClick={toggleExpand}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleExpand(e);
            }
          }}
        >
          {isArray ? ` ... ${value.length} items ` : ` ... ${keys.length} keys `}
        </span>
      )}
      
      {expanded && (
        <div className="json-tree-children">
          {isArray
            ? value.map((item, idx) => (
                <JsonNode
                  key={idx}
                  value={item}
                  isLast={idx === value.length - 1}
                  defaultExpanded={defaultExpanded}
                />
              ))
            : keys.map((key, idx) => (
                <JsonNode
                  key={key}
                  name={key}
                  value={value[key]}
                  isLast={idx === keys.length - 1}
                  defaultExpanded={defaultExpanded}
                />
              ))}
        </div>
      )}
      
      <span className="json-tree-bracket">{endBracket}</span>
      {renderComma()}
    </div>
  );
}

/**
 * Root Tree View component.
 */
function JsonTreeView({ data, defaultExpanded = true }) {
  return (
    <div className="json-tree-container">
      <JsonNode value={data} isLast={true} defaultExpanded={defaultExpanded} />
    </div>
  );
}

/**
 * Main JSON Formatter and Validator Tool Component.
 */
export default function JsonTool({ onBack }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [indent, setIndent] = useState('2');
  const [viewMode, setViewMode] = useState('text');
  const [validation, setValidation] = useState({ isValid: true, message: '', snippet: '' });
  const [toast, setToast] = useState('');
  const [treeExpanded, setTreeExpanded] = useState(true);
  const [treeKey, setTreeKey] = useState(0);

  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);

  // Sync scroll between line numbers side-bar and textarea
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Perform real-time validation
  useEffect(() => {
    if (!input.trim()) {
      setValidation({ isValid: true, message: '', snippet: '' });
      return;
    }
    const result = validateJson(input);
    setValidation(result);
  }, [input]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
    setOutput('');
  };

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
    } catch (err) {
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
        setToast('Copied to clipboard!');
        setTimeout(() => setToast(''), 3000);
      })
      .catch((err) => {
        console.error('Failed to copy: ', err);
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
    setTreeExpanded(expand);
    setTreeKey(prev => prev + 1);
  };

  // Generate line numbers array
  const lines = input.split('\n');
  const lineCount = Math.max(lines.length, 1);

  // Parse JSON data for tree-view safely
  let parsedData = null;
  if (validation.isValid && input.trim()) {
    try {
      parsedData = JSON.parse(input);
    } catch (e) {
      // Fail silently since validation state covers this
    }
  }

  return (
    <section className="json-tool-container" aria-label="JSON Utility Tool">
      {toast && (
        <div className="toast" role="alert">
          <span>✅</span> {toast}
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

          <div className="editor-container">
            <div className="line-numbers" ref={lineNumbersRef} aria-hidden="true">
              {Array.from({ length: lineCount }).map((_, i) => (
                <div key={i} className="line-number-item">{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="editor-textarea"
              placeholder="Paste or type your JSON here..."
              value={input}
              onChange={handleInputChange}
              onScroll={handleScroll}
              aria-label="JSON Input Area"
              spellCheck="false"
            />
          </div>
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
              <div className="output-container">
                <div className="json-tree-wrapper">
                  <JsonTreeView key={treeKey} data={parsedData} defaultExpanded={treeExpanded} />
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
                  {output || (input.trim() ? formatJson(input, indent) : '')}
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
