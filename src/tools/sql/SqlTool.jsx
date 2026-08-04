import { useEffect, useMemo, useState } from 'react';
import { formatSql, minifySql } from './sql.utils.js';
import './sql.css';

const OUTPUT_TABS = {
  FORMATTED: 'formatted',
  MINIFIED: 'minified',
};

const SAMPLE_PRESETS = [
  {
    id: 'select-join',
    label: 'Multi-JOIN SELECT query',
    sql:
      'SELECT u.id, u.name, o.total, p.name AS product_name\n' +
      'FROM users u\n' +
      'INNER JOIN orders o ON o.user_id = u.id\n' +
      'LEFT JOIN order_items oi ON oi.order_id = o.id\n' +
      'LEFT JOIN products p ON p.id = oi.product_id\n' +
      'WHERE u.active = 1 AND o.total > 100\n' +
      'ORDER BY o.total DESC\n' +
      'LIMIT 20',
  },
  {
    id: 'insert',
    label: 'INSERT query',
    sql:
      'INSERT INTO users (id, name, email, active)\n' +
      "VALUES (1, 'Ada Lovelace', 'ada@example.com', true)",
  },
  {
    id: 'create-table',
    label: 'CREATE TABLE query',
    sql:
      'CREATE TABLE users (\n' +
      '  id INT PRIMARY KEY,\n' +
      '  name VARCHAR(255) NOT NULL,\n' +
      '  email VARCHAR(255) NOT NULL,\n' +
      '  created_at TIMESTAMP DEFAULT NOW()\n' +
      ')',
  },
];

/**
 * Renders a SQL formatter/minifier tool with keyword casing, indent width,
 * subquery-aware reindentation, and single-line minification.
 *
 * @returns {React.JSX.Element} The SQL formatter tool UI.
 */
export default function SqlTool() {
  const [input, setInput] = useState('');
  const [keywordCase, setKeywordCase] = useState('upper');
  const [indentSize, setIndentSize] = useState('2');
  const [activeTab, setActiveTab] = useState(OUTPUT_TABS.FORMATTED);
  const [presetId, setPresetId] = useState(SAMPLE_PRESETS[0].id);
  const [notice, setNotice] = useState('');

  const result = useMemo(() => {
    if (!input.trim()) return { formatted: '', minified: '', error: '' };
    try {
      return {
        formatted: formatSql(input, { keywordCase, indentSize }),
        minified: minifySql(input),
        error: '',
      };
    } catch (err) {
      return { formatted: '', minified: '', error: err.message };
    }
  }, [input, keywordCase, indentSize]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 1500);
    return () => clearTimeout(timer);
  }, [notice]);

  const activeOutput =
    activeTab === OUTPUT_TABS.FORMATTED ? result.formatted : result.minified;

  function handleClear() {
    setInput('');
    setNotice('Cleared.');
  }

  function handlePresetChange(event) {
    const id = event.target.value;
    setPresetId(id);
    const preset = SAMPLE_PRESETS.find((p) => p.id === id);
    if (preset) setInput(preset.sql);
  }

  async function handleCopy() {
    if (!activeOutput) return;
    try {
      await navigator.clipboard.writeText(activeOutput);
      setNotice('Copied to clipboard.');
    } catch {
      setNotice('Unable to copy to clipboard.');
    }
  }

  return (
    <section className="sql-tool" aria-label="SQL Formatter Tool">
      <div className="sql-tool__toolbar">
        <div className="sql-tool__presets">
          <label htmlFor="sql-preset-select">Sample query</label>
          <select id="sql-preset-select" value={presetId} onChange={handlePresetChange}>
            {SAMPLE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sql-tool__actions">
          <button type="button" className="sql-tool__button" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="sql-tool__options" aria-label="Formatting options">
        <label>
          Keyword case
          <select
            value={keywordCase}
            onChange={(event) => setKeywordCase(event.target.value)}
            aria-label="Keyword case"
          >
            <option value="upper">UPPERCASE</option>
            <option value="lower">lowercase</option>
            <option value="preserve">Preserve</option>
          </select>
        </label>
        <label>
          Indent width
          <select
            value={indentSize}
            onChange={(event) => setIndentSize(event.target.value)}
            aria-label="Indent width"
          >
            <option value="2">2 spaces</option>
            <option value="4">4 spaces</option>
            <option value="tab">Tab</option>
          </select>
        </label>
      </div>

      <div className="sql-tool__panels">
        <div className="sql-tool__panel">
          <label htmlFor="sql-input">SQL input</label>
          <textarea
            id="sql-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste or type your SQL query…"
            spellCheck={false}
          />
        </div>

        <div className="sql-tool__panel">
          <div className="sql-tool__output-label">
            <div className="sql-tool__tabs" role="tablist" aria-label="Output view">
              <button
                type="button"
                role="tab"
                className={activeTab === OUTPUT_TABS.FORMATTED ? 'is-active' : ''}
                aria-selected={activeTab === OUTPUT_TABS.FORMATTED}
                onClick={() => setActiveTab(OUTPUT_TABS.FORMATTED)}
              >
                Formatted
              </button>
              <button
                type="button"
                role="tab"
                className={activeTab === OUTPUT_TABS.MINIFIED ? 'is-active' : ''}
                aria-selected={activeTab === OUTPUT_TABS.MINIFIED}
                onClick={() => setActiveTab(OUTPUT_TABS.MINIFIED)}
              >
                Minified
              </button>
            </div>
            <button
              type="button"
              className="sql-tool__button"
              onClick={handleCopy}
              disabled={!activeOutput}
              aria-label="Copy output to clipboard"
            >
              Copy
            </button>
          </div>

          {result.error ? (
            <div className="sql-tool__error" role="alert">
              ⚠ {result.error}
            </div>
          ) : (
            <textarea
              id="sql-output"
              value={activeOutput}
              readOnly
              placeholder="Result will appear here…"
              spellCheck={false}
              aria-label={activeTab === OUTPUT_TABS.FORMATTED ? 'Formatted SQL' : 'Minified SQL'}
            />
          )}
        </div>
      </div>

      <p className="sql-tool__notice" role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}
