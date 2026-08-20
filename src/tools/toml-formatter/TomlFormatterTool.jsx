import { useMemo, useState } from 'react';
import { formatToml } from './tomlFormatter.utils.js';
import './tomlFormatter.css';

const SAMPLE_TOML = `title = "Dev Toolkit"
active = true
version = 1.0
released = 2026-08-19T10:30:00+09:00
tags = ["formatter", "toml"]

[project]
name = 'TOML Formatter'
contributors = [{ name = "Ada" }, { name = "Lin" }]

[[project.features]]
name = "JSON preview"
enabled = true`;

/** Renders a client-side TOML formatter with a JSON inspection view. */
export default function TomlFormatterTool() {
  const [input, setInput] = useState(SAMPLE_TOML);
  const [view, setView] = useState('toml');
  const result = useMemo(() => {
    if (!input.trim()) return { error: null, json: '', toml: '' };
    try {
      return { ...formatToml(input), error: null };
    } catch (error) {
      return { error, json: '', toml: '' };
    }
  }, [input]);

  const output = view === 'toml' ? result.toml : result.json;

  return (
    <section className="toml-formatter" aria-label="TOML Formatter">
      <header className="toml-formatter__intro">
        <p className="toml-formatter__eyebrow">Formatter</p>
        <h2>TOML Formatter</h2>
        <p>Validate TOML locally, normalize its layout, and inspect its JSON structure.</p>
      </header>

      <div className="toml-formatter__controls">
        <div className="toml-formatter__tabs" role="tablist" aria-label="Output format">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'toml'}
            className={view === 'toml' ? 'is-active' : ''}
            onClick={() => setView('toml')}
          >
            Formatted TOML
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'json'}
            className={view === 'json' ? 'is-active' : ''}
            onClick={() => setView('json')}
          >
            JSON Preview
          </button>
        </div>
        <div className="toml-formatter__actions">
          <button type="button" onClick={() => setInput(SAMPLE_TOML)}>Load sample</button>
          <button type="button" onClick={() => setInput('')}>Clear</button>
        </div>
      </div>

      <div className="toml-formatter__panes">
        <div className="toml-formatter__pane">
          <label htmlFor="toml-formatter-input">TOML input</label>
          <textarea
            id="toml-formatter-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste TOML here..."
            spellCheck="false"
          />
        </div>
        <div className="toml-formatter__pane">
          <label htmlFor="toml-formatter-output">
            {view === 'toml' ? 'Formatted TOML output' : 'Parsed JSON preview'}
          </label>
          <textarea
            id="toml-formatter-output"
            value={output}
            readOnly
            placeholder="Formatted output appears here..."
            spellCheck="false"
            aria-label={view === 'toml' ? 'Formatted TOML output' : 'Parsed JSON preview'}
          />
        </div>
      </div>

      {result.error && (
        <div className="toml-formatter__error" role="alert">
          <strong>TOML input is invalid.</strong>
          <span>
            Line {result.error.line || 1}, column {result.error.column || 1}:{' '}
            {result.error.reason || result.error.message}
          </span>
        </div>
      )}
    </section>
  );
}
