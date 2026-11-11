import { useRef, useState } from 'react';
import { formatHex, parsePng } from './png-inspector.utils.js';
import './png-chunk-inspector.css';

/** Renders a fully client-side PNG chunk inspector. */
export default function PngChunkInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    try {
      const parsed = parsePng(await file.arrayBuffer());
      setResult(parsed);
      setFileName(file.name);
      setError('');
    } catch (parseError) {
      setResult(null);
      setFileName(file.name);
      setError(parseError.message);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    inspectFile(event.dataTransfer.files?.[0]);
  }

  function clear() {
    setResult(null); setError(''); setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return <section className="png-inspector" aria-label="PNG Chunk Inspector">
    <div className="png-inspector__actions">
      <label className="png-inspector__upload">
        Choose PNG file
      <input
        ref={inputRef}
        type="file"
        accept="image/png,.png"
        aria-label="Choose PNG file"
        onChange={(event) => inspectFile(event.target.files?.[0])}
      />
      </label>
      <button type="button" onClick={clear}>Clear</button>
    </div>
    <div
      className="png-inspector__dropzone"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      Drop a PNG file here to inspect it entirely in your browser.
    </div>
    {fileName && <p className="png-inspector__filename">File: {fileName}</p>}
    {error && <div className="png-inspector__error" role="alert">{error}</div>}
    {result?.errors.map((message) => (
      <div className="png-inspector__error" role="alert" key={message}>{message}</div>
    ))}
    {result && <div className="png-inspector__table-wrap"><table>
      <caption>PNG chunks</caption>
      <thead><tr>
        <th>Type</th><th>Offset</th><th>Length</th><th>CRC</th>
        <th>Decoded details</th><th>Raw bytes</th>
      </tr></thead>
      <tbody>{result.chunks.map((chunk) => <tr key={`${chunk.offset}-${chunk.type}`}>
        <td>{chunk.type}</td><td>{chunk.offset}</td><td>{chunk.length}</td>
        <td className={chunk.crcValid ? 'png-inspector__valid' : 'png-inspector__invalid'}>
          {chunk.crcValid ? 'Valid' : 'Invalid'}
        </td>
        <td>{chunk.decoded && <dl>{Object.entries(chunk.decoded).map(([key, value]) => (
          <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>
        ))}</dl>}</td>
        <td><details><summary>View bytes</summary>
          <code>{formatHex(chunk.rawBytes)}</code>
        </details></td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
