import { useState } from 'react';
import { minifySvg, toBase64DataUri, toCssDataUri } from './svgMinifier.utils.js';
import './svgMinifier.css';

const SAMPLE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- A small sample icon -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
  xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" viewBox="0 0 24 24"
  inkscape:version="1.3" sodipodi:docname="spark.svg">
  <path d="M12 2 14.4 9.6 22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4Z" fill="#818cf8" />
</svg>`;

/**
 * Renders an entirely local SVG minifier and data-URI generator.
 *
 * @returns {React.JSX.Element} The SVG Minifier tool UI.
 */
export default function SvgMinifierTool() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  const cssDataUri = result ? toCssDataUri(result.minified) : '';
  const base64DataUri = result ? toBase64DataUri(result.minified) : '';

  function handleMinify() {
    const nextResult = minifySvg(input);
    if (nextResult.error) {
      setResult(null);
      setError(nextResult.error);
      setCopyStatus('');
      return;
    }

    setResult(nextResult);
    setError('');
    setCopyStatus('');
  }

  function loadSample() {
    setInput(SAMPLE_SVG);
    setResult(null);
    setError('');
    setCopyStatus('');
  }

  function clearTool() {
    setInput('');
    setResult(null);
    setError('');
    setCopyStatus('');
  }

  async function copyValue(value, label) {
    try {
      if (!value || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard is unavailable.');
      }
      await navigator.clipboard.writeText(value);
      setCopyStatus(`Copied ${label} to clipboard.`);
    } catch {
      setCopyStatus(`Could not copy ${label} to clipboard.`);
    }
  }

  return (
    <section className="svg-minifier-tool" aria-label="SVG Minifier">
      <header className="svg-minifier-tool__intro">
        <p className="svg-minifier-tool__eyebrow">Formatter</p>
        <h2>SVG Minifier</h2>
        <p>
          Remove export cruft locally, compare UTF-8 byte savings, and copy embed-ready data URIs.
        </p>
      </header>

      <div className="svg-minifier-tool__actions">
        <button type="button" onClick={handleMinify}>Minify SVG</button>
        <button type="button" onClick={loadSample}>Load sample</button>
        <button type="button" onClick={clearTool}>Clear</button>
      </div>

      <div className="svg-minifier-tool__input-panel">
        <label htmlFor="svg-minifier-input">Raw SVG markup</label>
        <textarea
          id="svg-minifier-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Paste SVG markup here..."
          spellCheck="false"
        />
      </div>

      {error && <p className="svg-minifier-tool__error" role="alert">{error}</p>}

      <div className="svg-minifier-tool__outputs">
        <section className="svg-minifier-tool__output-panel" aria-labelledby="minified-svg-heading">
          <div className="svg-minifier-tool__output-heading">
            <div>
              <h3 id="minified-svg-heading">Minified SVG markup</h3>
              {result && (
                <p>
                  {result.originalBytes} B → {result.minifiedBytes} B
                  {' '}({result.savedPercent}% saved)
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => copyValue(result?.minified, 'minified SVG markup')}
              disabled={!result}
              aria-label="Copy minified SVG markup"
            >
              Copy
            </button>
          </div>
          <textarea
            value={result?.minified || ''}
            readOnly
            aria-label="Minified SVG markup output"
            placeholder="Minified SVG markup will appear here..."
            spellCheck="false"
          />
        </section>

        <section className="svg-minifier-tool__output-panel" aria-labelledby="css-uri-heading">
          <div className="svg-minifier-tool__output-heading">
            <h3 id="css-uri-heading">CSS background-image data URI</h3>
            <button
              type="button"
              onClick={() => copyValue(cssDataUri, 'CSS data URI')}
              disabled={!result}
              aria-label="Copy CSS background-image data URI"
            >
              Copy
            </button>
          </div>
          <textarea
            value={cssDataUri}
            readOnly
            aria-label="CSS background-image data URI output"
            placeholder="CSS background-image snippet will appear here..."
            spellCheck="false"
          />
        </section>

        <section className="svg-minifier-tool__output-panel" aria-labelledby="base64-uri-heading">
          <div className="svg-minifier-tool__output-heading">
            <h3 id="base64-uri-heading">Base64 image data URI</h3>
            <button
              type="button"
              onClick={() => copyValue(base64DataUri, 'base64 image data URI')}
              disabled={!result}
              aria-label="Copy base64 image data URI"
            >
              Copy
            </button>
          </div>
          <textarea
            value={base64DataUri}
            readOnly
            aria-label="Base64 image data URI output"
            placeholder="Base64 image data URI will appear here..."
            spellCheck="false"
          />
        </section>
      </div>

      {result && (
        <figure className="svg-minifier-tool__preview" aria-label="Minified SVG preview">
          <figcaption>Live preview <span className="sr-only">of the minified SVG</span></figcaption>
          <img src={base64DataUri} alt="" />
        </figure>
      )}

      {copyStatus && (
        <p className="svg-minifier-tool__status" role="status" aria-live="polite">{copyStatus}</p>
      )}
    </section>
  );
}
