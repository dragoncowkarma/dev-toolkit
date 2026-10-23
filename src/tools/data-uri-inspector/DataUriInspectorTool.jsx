import { useEffect, useState } from 'react';
import { inspectDataUri } from './dataUriInspector.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './dataUriInspector.css';

const PLACEHOLDER = 'data:text/plain;charset=US-ASCII,Hello%2C%20World!';

/**
 * Renders the Data URI Inspector tool: parses and decodes an arbitrary `data:` URL
 * entirely client-side, reporting its media type, parameters, encoding mode, and a
 * bounded, non-executable preview of the decoded bytes.
 *
 * @returns {React.JSX.Element} The Data URI Inspector tool UI.
 */
export default function DataUriInspectorTool() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [uriCopied, showUriCopied] = useCopyFeedback({ initialValue: false, resetValue: false });
  const [previewCopied, showPreviewCopied] = useCopyFeedback({
    initialValue: false,
    resetValue: false,
  });
  const [copyError, setCopyError] = useState('');

  useEffect(() => {
    if (input.trim() === '') {
      setResult(null);
      setError('');
      return;
    }
    try {
      setResult(inspectDataUri(input));
      setError('');
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }, [input]);

  function handleInputChange(event) {
    setInput(event.target.value);
    setCopyError('');
  }

  function handleClear() {
    setInput('');
    setResult(null);
    setError('');
    setCopyError('');
  }

  async function handleCopyUri() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.canonicalUri);
      showUriCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy the canonical URI to clipboard.');
    }
  }

  async function handleCopyPreview() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.preview.value);
      showPreviewCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy the decoded preview to clipboard.');
    }
  }

  const alertMessage = error || copyError;

  return (
    <section className="data-uri-inspector" aria-label="Data URI Inspector Tool">
      <div className="data-uri-toolbar">
        <label className="data-uri-label" htmlFor="data-uri-input">
          Data URL
        </label>
        <button type="button" className="btn" onClick={handleClear}>
          Clear
        </button>
      </div>

      <textarea
        id="data-uri-input"
        className="data-uri-textarea"
        placeholder={PLACEHOLDER}
        value={input}
        onChange={handleInputChange}
        spellCheck={false}
        aria-describedby={error ? 'data-uri-error' : undefined}
      />

      {alertMessage && (
        <div id="data-uri-error" className="data-uri-error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}

      {result && (
        <div className="data-uri-result" aria-label="Inspection result">
          <dl className="data-uri-meta">
            <div className="data-uri-meta-row">
              <dt>Media type</dt>
              <dd>{result.mediaType}</dd>
            </div>
            <div className="data-uri-meta-row">
              <dt>Parameters</dt>
              <dd>
                {result.params.length > 0
                  ? result.params.map((param) => `${param.name}=${param.value}`).join('; ')
                  : '(none)'}
              </dd>
            </div>
            <div className="data-uri-meta-row">
              <dt>Encoding mode</dt>
              <dd>{result.isBase64 ? 'base64' : 'percent-encoded'}</dd>
            </div>
            <div className="data-uri-meta-row">
              <dt>Encoded length</dt>
              <dd>{result.encodedLength} characters</dd>
            </div>
            <div className="data-uri-meta-row">
              <dt>Decoded size</dt>
              <dd>{result.decodedByteLength} bytes</dd>
            </div>
          </dl>

          <div className="data-uri-panel">
            <div className="panel-label-row">
              <label className="panel-label" htmlFor="data-uri-canonical">
                Canonical URI
              </label>
              <button type="button" className="btn copy-btn" onClick={handleCopyUri}>
                {uriCopied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            {uriCopied && (
              <div className="sr-only" role="status" aria-live="polite">
                Canonical URI copied to clipboard
              </div>
            )}
            <textarea
              id="data-uri-canonical"
              className="data-uri-textarea data-uri-textarea--output"
              value={result.canonicalUri}
              readOnly
              spellCheck={false}
            />
          </div>

          <div className="data-uri-panel">
            <div className="panel-label-row">
              <label className="panel-label" htmlFor="data-uri-preview">
                Decoded preview ({result.preview.kind === 'text' ? 'text' : 'hex'})
                {result.preview.truncated ? ' — truncated' : ''}
              </label>
              <button type="button" className="btn copy-btn" onClick={handleCopyPreview}>
                {previewCopied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            {previewCopied && (
              <div className="sr-only" role="status" aria-live="polite">
                Decoded preview copied to clipboard
              </div>
            )}
            <textarea
              id="data-uri-preview"
              className="data-uri-textarea data-uri-textarea--output"
              value={result.preview.value}
              readOnly
              spellCheck={false}
            />
          </div>
        </div>
      )}
    </section>
  );
}
