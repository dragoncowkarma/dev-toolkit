import { useMemo, useState } from 'react';
import { inspectJsonLd } from './jsonLd.utils.js';
import './jsonLd.css';

function displayValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}

function JsonTree({ label, value, depth = 0 }) {
  const isCollection = value !== null && typeof value === 'object';
  const entries = Array.isArray(value)
    ? value.map((item, index) => [index, item])
    : isCollection
      ? Object.entries(value)
      : [];

  if (!isCollection) {
    return (
      <li className="json-ld-tree__item" style={{ '--tree-depth': depth }}>
        <span className="json-ld-tree__key">{label}</span>
        <span className="json-ld-tree__value">{displayValue(value)}</span>
      </li>
    );
  }

  return (
    <li className="json-ld-tree__item" style={{ '--tree-depth': depth }}>
      <span className="json-ld-tree__key">{label}</span>
      <span className="json-ld-tree__value">{Array.isArray(value) ? '[ ]' : '{ }'}</span>
      <ul className="json-ld-tree">
        {entries.map(([key, child]) => (
          <JsonTree key={key} label={Array.isArray(value) ? `[${key}]` : key} value={child} depth={depth + 1} />
        ))}
      </ul>
    </li>
  );
}

/**
 * Renders a client-side JSON-LD validator and linked-data inspector.
 *
 * @returns {React.JSX.Element} The JSON-LD inspector UI.
 */
export default function JsonLdTool() {
  const [input, setInput] = useState('');
  const inspection = useMemo(() => inspectJsonLd(input), [input]);
  const hasInput = input.trim() !== '';
  const typeNames = [...new Set(inspection.entities.flatMap((entity) => entity.types))];

  return (
    <section className="json-ld-tool" aria-label="JSON-LD Inspector">
      <div className="json-ld-tool__header">
        <div>
          <p className="json-ld-tool__eyebrow">Client-side inspector</p>
          <h2>Validate JSON-LD markup</h2>
          <p>Paste JSON-LD or a script tag. Your data stays in this browser.</p>
        </div>
        <button type="button" className="json-ld-tool__clear" onClick={() => setInput('')} disabled={!hasInput}>
          Clear
        </button>
      </div>

      <label className="json-ld-tool__label" htmlFor="json-ld-input">JSON-LD document</label>
      <textarea
        id="json-ld-input"
        className="json-ld-tool__input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "Article"\n}'}
        spellCheck={false}
      />

      {hasInput && inspection.error && (
        <div className="json-ld-tool__message json-ld-tool__message--error" role="alert">
          <strong>Could not parse this JSON-LD.</strong> {inspection.error}
        </div>
      )}

      {hasInput && !inspection.error && (
        <>
          <div className="json-ld-tool__message json-ld-tool__message--success" role="status">
            Valid JSON structure.
            {inspection.strippedScriptTags && ' Extracted JSON-LD from embedded script tags.'}
          </div>

          <div className="json-ld-summary" aria-label="JSON-LD summary">
            <div className="json-ld-summary__item">
              <span>Entities</span>
              <strong>{inspection.entities.length}</strong>
            </div>
            <div className="json-ld-summary__item">
              <span>Vocabulary</span>
              <strong>{inspection.vocabulary}</strong>
            </div>
            <div className="json-ld-summary__item">
              <span>Types</span>
              <strong>{typeNames.length ? typeNames.join(', ') : 'Not specified'}</strong>
            </div>
          </div>

          {inspection.issues.length > 0 && (
            <div className="json-ld-tool__issues" role="status" aria-label="Structural checks">
              <strong>Structural checks</strong>
              <ul>
                {inspection.issues.map((issue) => (
                  <li key={`${issue.path}-${issue.message}`}><code>{issue.path}</code> — {issue.message}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="json-ld-tool__hierarchy" aria-labelledby="json-ld-hierarchy-title">
            <h3 id="json-ld-hierarchy-title">Parsed hierarchy</h3>
            <ul className="json-ld-tree">
              <JsonTree label={Array.isArray(inspection.document) ? 'Document array' : 'Document'} value={inspection.document} />
            </ul>
          </section>
        </>
      )}
    </section>
  );
}
