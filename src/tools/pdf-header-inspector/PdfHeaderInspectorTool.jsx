import { useRef, useState } from 'react';
import { decodePdfHex, parsePdfBytes } from './pdfHeaderInspector.utils.js';
import './pdfHeaderInspector.css';

/**
 * Renders a local PDF file structure inspector.
 *
 * @returns {React.JSX.Element} The PDF Header Inspector UI.
 */
export default function PdfHeaderInspectorTool() {
  const [hexInput, setHexInput] = useState('');
  const [result, setResult] = useState(null);
  const [source, setSource] = useState('');
  const fileInputRef = useRef(null);

  function inspectBytes(bytes, label) {
    setSource(label);
    setResult(parsePdfBytes(bytes));
  }

  function handleHexInspect() {
    const decoded = decodePdfHex(hexInput);
    if ('error' in decoded) {
      setSource('Hex input');
      setResult({ status: 'undecoded', error: decoded.error });
      return;
    }
    inspectBytes(decoded.bytes, 'Hex input');
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      inspectBytes(new Uint8Array(await file.arrayBuffer()), file.name);
    } catch {
      setSource(file.name);
      setResult({ status: 'undecoded', error: 'Could not read the selected file.' });
    }
  }

  function handleClear() {
    setHexInput('');
    setResult(null);
    setSource('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="pdf-header-inspector" aria-label="PDF Header Inspector">
      <div className="pdf-header-inspector__toolbar">
        <label className="pdf-header-inspector__button pdf-header-inspector__file-button">
          Choose PDF
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileChange}
            aria-label="Choose a PDF file"
          />
        </label>
        <button type="button" className="pdf-header-inspector__button" onClick={handleClear}>
          Clear
        </button>
      </div>

      <div className="pdf-header-inspector__panels">
        <div className="pdf-header-inspector__panel">
          <label htmlFor="pdf-hex-input">PDF bytes as hex</label>
          <textarea
            id="pdf-hex-input"
            value={hexInput}
            onChange={(event) => setHexInput(event.target.value)}
            placeholder="255044462d312e340a..."
            spellCheck={false}
          />
          <button type="button" className="pdf-header-inspector__button" onClick={handleHexInspect}>
            Inspect hex
          </button>
        </div>

        <div className="pdf-header-inspector__panel" aria-live="polite">
          <span>Parsed structure{source ? ` — ${source}` : ''}</span>
          {!result && (
            <p className="pdf-header-inspector__empty">Choose a PDF or paste its hex bytes.</p>
          )}
          {result?.status === 'undecoded' && <p role="alert">Could not parse: {result.error}</p>}
          {result?.status === 'parsed' && (
            <dl>
              <dt>PDF version</dt><dd>{result.version}</dd>
              <dt>startxref</dt><dd>{result.startxref}</dd>
              <dt>EOF marker</dt><dd>Byte {result.eofOffset}</dd>
              <dt>Linearized</dt><dd>{result.hasLinearizationHint ? 'Hint present' : 'No hint'}</dd>
              <dt>Cross-reference</dt><dd>{result.xrefType}</dd>
              <dt>Trailer Root</dt><dd>{result.trailer.root ?? 'Not present'}</dd>
              <dt>Trailer Size</dt><dd>{result.trailer.size ?? 'Not present'}</dd>
              <dt>Trailer Prev</dt><dd>{result.trailer.previous ?? 'Not present'}</dd>
              <dt>Trailer dictionary</dt><dd><code>{result.trailer.dictionary}</code></dd>
            </dl>
          )}
          {result?.notice && <p className="pdf-header-inspector__notice">{result.notice}</p>}
          {result?.xrefType === 'classic' && (
            <div className="pdf-header-inspector__entries">
              <strong>Classic xref entries ({result.xrefEntries.length})</strong>
              <table>
                <thead>
                  <tr><th>Object</th><th>Offset</th><th>Generation</th><th>Flag</th></tr>
                </thead>
                <tbody>{result.xrefEntries.map((entry) => (
                  <tr key={entry.objectNumber}>
                    <td>{entry.objectNumber}</td><td>{entry.offset}</td>
                    <td>{entry.generation}</td>
                    <td>{entry.inUse ? 'in use (n)' : 'free (f)'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
