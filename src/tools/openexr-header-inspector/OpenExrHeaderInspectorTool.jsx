import { useRef, useState } from 'react';
import { parseOpenExr } from './openexr.utils.js';
import './openexr.css';

/** Render a local OpenEXR header inspector. */
export default function OpenExrHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const requestRef = useRef(0);

  function clear() {
    requestRef.current += 1;
    setResult(null);
    setFileName('');
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function selectFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const request = ++requestRef.current;
    setResult(null);
    setFileName(file.name);
    setError('');
    try {
      const buffer = await file.arrayBuffer();
      if (request !== requestRef.current) return;
      setResult(parseOpenExr(buffer));
    } catch (err) {
      if (request === requestRef.current) setError(err.message || 'Failed to read the file.');
    }
  }

  return (
    <section className="exr-tool" aria-label="OpenEXR Header Inspector">
      <div className="exr-toolbar">
        <label className="exr-button exr-file">
          Choose OpenEXR file
          <input ref={inputRef} type="file" accept=".exr" onChange={selectFile} />
        </label>
        <button className="exr-button" type="button" onClick={clear}>Clear</button>
      </div>
      <p>Files are inspected locally in your browser.</p>
      {fileName && <p>File: {fileName}</p>}
      {error && <div className="exr-error" role="alert">{error}</div>}
      {result && (
        <div aria-live="polite">
          <h2>Header</h2>
          <p>Version: {result.version}</p>
          <p>Flags: {Object.entries(result.flags).filter(([, enabled]) => enabled)
            .map(([name]) => name).join(', ') || 'None'}</p>
          {result.headers.map((attributes, index) => (
            <section key={index}>
              <h3>{result.flags.multipart ? `Part ${index + 1}` : 'Attributes'}</h3>
              <div className="exr-table-wrap">
                <table>
                  <thead><tr><th scope="col">Name</th><th scope="col">Type</th>
                    <th scope="col">Size</th><th scope="col">Value</th></tr></thead>
                  <tbody>{attributes.map((attribute, attributeIndex) => (
                    <tr key={attributeIndex}>
                      <th scope="row">{attribute.name}</th><td>{attribute.type}</td>
                      <td>{attribute.size}</td>
                      <td><pre>{attribute.value === null ? 'Not decoded' :
                        JSON.stringify(attribute.value, null, 2)}</pre></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
