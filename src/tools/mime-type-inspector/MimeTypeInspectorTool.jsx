import { useEffect, useMemo, useRef, useState } from 'react';
import { parseMimeType, toJSONRepresentation } from './mimeTypeInspector.utils.js';
import './mimeTypeInspector.css';

const PRESETS = [
  { label: 'JSON', value: 'application/json; charset=utf-8' },
  { label: 'HTML Header', value: 'Content-Type: text/html; charset=utf-8' },
  { label: 'Multipart Form', value: 'multipart/form-data; boundary=---GCB_boundary123' },
  { label: 'SVG Image', value: 'image/svg+xml' },
  { label: 'Quoted Parameter', value: 'application/vnd.api+json; name="foo\\"bar\\\\baz"' },
  { label: 'Invalid Syntax', value: 'text/html; charset="unclosed' },
];

/**
 * MIME Type Inspector tool component.
 * Allows developers to parse, validate, canonicalize, and inspect Content-Type headers
 * and standalone media types locally.
 *
 * @returns {React.JSX.Element} The rendered React component.
 */
export default function MimeTypeInspectorTool() {
  const [input, setInput] = useState('text/html; charset=utf-8');
  const [copyFeedback, setCopyFeedback] = useState('');
  const copyTimeoutRef = useRef(null);

  const parsed = useMemo(() => parseMimeType(input), [input]);
  const jsonRepresentation = useMemo(() => toJSONRepresentation(parsed), [parsed]);

  useEffect(() => {
    return () => {
      clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = null;
    };
  }, []);

  const triggerCopyFeedback = (msg) => {
    setCopyFeedback(msg);
    clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => {
      copyTimeoutRef.current = null;
      setCopyFeedback((current) => (current === msg ? '' : current));
    }, 3000);
  };

  const handleCopyCanonical = async () => {
    if (!parsed.isValid || !parsed.canonical) return;
    try {
      await navigator.clipboard.writeText(parsed.canonical);
      triggerCopyFeedback('Copied canonical value to clipboard');
    } catch {
      triggerCopyFeedback('Failed to copy to clipboard');
    }
  };

  const handleCopyJSON = async () => {
    if (!parsed.isValid) return;
    try {
      await navigator.clipboard.writeText(jsonRepresentation);
      triggerCopyFeedback('Copied JSON representation to clipboard');
    } catch {
      triggerCopyFeedback('Failed to copy to clipboard');
    }
  };

  return (
    <div className="mime-inspector">
      <div className="mime-inspector__header">
        <h2 className="mime-inspector__title">MIME Type Inspector</h2>
        <p className="mime-inspector__description">
          Parse, validate, normalize, and inspect standalone media types or full Content-Type
          headers locally.
        </p>
      </div>

      <div className="mime-inspector__presets">
        <span className="mime-inspector__presets-label">Sample Presets:</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="mime-inspector__btn mime-inspector__btn--preset"
            onClick={() => setInput(preset.value)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mime-inspector__input-section">
        <label htmlFor="mime-input-field" className="mime-inspector__label">
          Media Type or Content-Type Header Value
        </label>
        <div className="mime-inspector__input-wrapper">
          <textarea
            id="mime-input-field"
            className="mime-inspector__textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. text/html; charset=utf-8 or Content-Type: application/json"
            rows={3}
          />
        </div>
        <div className="mime-inspector__actions">
          <button
            type="button"
            className="mime-inspector__btn"
            onClick={() => setInput('')}
          >
            Clear Input
          </button>
        </div>
      </div>

      <div role="status" aria-live="polite" className="mime-inspector__status-msg">
        {copyFeedback}
      </div>

      {!parsed.isValid ? (
        <div role="alert" className="mime-inspector__alert">
          <span aria-hidden="true">⚠️</span>
          <div>
            <strong>Syntax or Validation Error:</strong> {parsed.error}
          </div>
        </div>
      ) : (
        <div className="mime-inspector__result">
          <div className="mime-inspector__canonical-bar">
            <div className="mime-inspector__canonical-content">
              <span className="mime-inspector__canonical-label">
                Canonical Serialized Result
              </span>
              <span className="mime-inspector__canonical-value">{parsed.canonical}</span>
            </div>
            <div className="mime-inspector__copy-group">
              <button
                type="button"
                className="mime-inspector__btn"
                onClick={handleCopyCanonical}
                aria-label="Copy canonical value"
              >
                Copy Canonical Value
              </button>
              <button
                type="button"
                className="mime-inspector__btn"
                onClick={handleCopyJSON}
                aria-label="Copy JSON representation"
              >
                Copy JSON Representation
              </button>
            </div>
          </div>

          <div className="mime-inspector__grid">
            <div className="mime-inspector__card">
              <span className="mime-inspector__card-label">Media Type</span>
              <span className="mime-inspector__card-value">{parsed.fullType}</span>
            </div>
            <div className="mime-inspector__card">
              <span className="mime-inspector__card-label">Type / Subtype</span>
              <span className="mime-inspector__card-value">
                {parsed.type} / {parsed.subtype}
              </span>
            </div>
            <div className="mime-inspector__card">
              <span className="mime-inspector__card-label">Category</span>
              <span className="mime-inspector__card-value">{parsed.category}</span>
            </div>
            <div className="mime-inspector__card">
              <span className="mime-inspector__card-label">Classification</span>
              <div>
                <span
                  className={`mime-inspector__badge ${
                    parsed.isKnown
                      ? 'mime-inspector__badge--known'
                      : 'mime-inspector__badge--unknown'
                  }`}
                >
                  {parsed.isKnown ? 'Known Standard' : 'Unrecognized / Custom'}
                </span>
              </div>
            </div>
            <div className="mime-inspector__card">
              <span className="mime-inspector__card-label">Registration Tree</span>
              <span className="mime-inspector__card-value">{parsed.tree}</span>
            </div>
            <div className="mime-inspector__card">
              <span className="mime-inspector__card-label">Structured Suffix</span>
              <span className="mime-inspector__card-value">
                {parsed.suffix ? `+${parsed.suffix}` : 'None'}
              </span>
            </div>
          </div>

          <div className="mime-inspector__note-box">
            <span className="mime-inspector__note-title">Safe Handling Guidance</span>
            <p className="mime-inspector__note-text">{parsed.handlingNote}</p>
          </div>

          {parsed.warnings.length > 0 && (
            <div className="mime-inspector__warnings">
              {parsed.warnings.map((warning, idx) => (
                <div key={idx} className="mime-inspector__warning-item">
                  ⚠️ <strong>Notice:</strong> {warning}
                </div>
              ))}
            </div>
          )}

          <div className="mime-inspector__section">
            <h3 className="mime-inspector__section-title">
              Parameters ({parsed.parameters.length})
            </h3>
            {parsed.parameters.length === 0 ? (
              <p className="mime-inspector__description">No parameters present.</p>
            ) : (
              <div className="mime-inspector__table-wrapper">
                <table className="mime-inspector__table">
                  <thead>
                    <tr>
                      <th>Parameter Name</th>
                      <th>Parsed Value</th>
                      <th>Quoted Status</th>
                      <th>Raw Segment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.parameters.map((param) => (
                      <tr key={param.name}>
                        <td>{param.name}</td>
                        <td>{param.value}</td>
                        <td>{param.isQuoted ? 'Quoted' : 'Unquoted'}</td>
                        <td>{param.raw}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mime-inspector__section">
            <h3 className="mime-inspector__section-title">JSON Representation</h3>
            <pre className="mime-inspector__json-preview">
              <code>{jsonRepresentation}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
