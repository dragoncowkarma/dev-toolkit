import { useEffect, useState } from 'react';
import { decodeExifInput, formatExifResult, parseExif } from './exifInspector.utils.js';
import './exifInspector.css';

const SAMPLE = '49492a000800000004000f0102000400000041424300100102000300000058590000' +
  '12010300010000000100000069870400010000003e000000000000000100039002001400000050000000' +
  '00000000323032343a30313a30312030303a30303a303000';

/**
 * Renders an offline EXIF metadata viewer for JPEG and TIFF byte payloads.
 *
 * @returns {React.JSX.Element} The EXIF inspector interface.
 */
export default function ExifInspectorTool() {
  const [input, setInput] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('auto');
  const [resolvedFormat, setResolvedFormat] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    if (!input.trim()) {
      setResult(null);
      setError('');
      setResolvedFormat('');
      return;
    }
    const decoded = decodeExifInput(input, selectedFormat);
    setResolvedFormat(decoded.format || '');
    if (decoded.error) {
      setResult(null);
      setError(decoded.error);
      return;
    }
    const parsed = parseExif(decoded.bytes);
    if (parsed.error) {
      setResult(null);
      setError(parsed.error);
      return;
    }
    setResult(parsed);
    setError('');
  }, [input, selectedFormat]);

  useEffect(() => {
    if (!copyStatus) return undefined;
    const timer = setTimeout(() => setCopyStatus(''), 1800);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Copied to clipboard.');
    } catch {
      setCopyStatus('Failed to copy to clipboard.');
    }
  }

  return (
    <section className="exif-inspector" aria-label="EXIF Metadata Viewer">
      <p className="exif-inspector__privacy">
        All parsing happens locally. Your image is never uploaded.
      </p>
      <div className="exif-inspector__controls">
        <label htmlFor="exif-format">Input format</label>
        <select
          id="exif-format"
          value={selectedFormat}
          onChange={(event) => setSelectedFormat(event.target.value)}
        >
          <option value="auto">Auto</option>
          <option value="hex">Hex</option>
          <option value="base64">Base64</option>
        </select>
        {resolvedFormat && (
          <p className="exif-inspector__resolved">
            Resolved format: <strong>{resolvedFormat}</strong>
          </p>
        )}
        <button type="button" onClick={() => setInput(SAMPLE)}>Load sample</button>
        <button
          type="button"
          onClick={() => {
            setInput('');
            setCopyStatus('');
          }}
        >
          Clear
        </button>
      </div>
      <label htmlFor="exif-payload">JPEG or TIFF payload</label>
      <textarea
        id="exif-payload"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        spellCheck={false}
        placeholder="Paste a hex or base64 JPEG/TIFF payload…"
      />
      <p className="exif-inspector__limit">Maximum payload size: 1 MiB.</p>
      <div className="sr-only" role="status">{copyStatus}</div>
      {(error || copyStatus.startsWith('Failed')) && (
        <div className="exif-inspector__error" role="alert">
          {error || copyStatus}
        </div>
      )}
      {result && (
        <section className="exif-inspector__results" aria-label="Parsed EXIF metadata">
          <div className="exif-inspector__result-header">
            <h3>Parsed metadata</h3>
            <button type="button" onClick={() => copy(formatExifResult(result))}>
              Copy all
            </button>
          </div>
          {result.gpsCoordinates && (
            <div className="exif-inspector__gps">
              <strong>GPS coordinates</strong>
              <code>{result.gpsCoordinates.text}</code>
              <button type="button" onClick={() => copy(result.gpsCoordinates.text)}>
                Copy coordinates
              </button>
            </div>
          )}
          {result.groups.map((group) => (
            <section className="exif-inspector__group" key={group.name}>
              <h4>{group.name}</h4>
              <div className="exif-inspector__table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tag</th>
                      <th>Offset</th>
                      <th>Type</th>
                      <th>Value</th>
                      <th>Copy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.fields.map((field) => (
                      <tr key={`${group.name}-${field.offset}`}>
                        <td>{field.name}</td>
                        <td>{field.offset}</td>
                        <td>{field.type}</td>
                        <td><code>{field.value}</code></td>
                        <td>
                          <button
                            type="button"
                            aria-label={`Copy ${field.name}`}
                            onClick={() => copy(field.value)}
                          >
                            Copy
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </section>
      )}
    </section>
  );
}
