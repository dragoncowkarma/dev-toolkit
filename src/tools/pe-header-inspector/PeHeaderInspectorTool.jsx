import { useRef, useState } from 'react';
import { decodeBase64Bytes, parsePeHeaders } from './pe-header-inspector.utils.js';
import './pe-header-inspector.css';

function HeaderTable({ title, rows }) {
  return (
    <section className="pe-header-inspector__group" aria-labelledby={`${title}-heading`}>
      <h2 id={`${title}-heading`}>{title}</h2>
      <div className="pe-header-inspector__table-wrap">
        <table>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Renders a client-side Windows PE/COFF executable header inspector.
 * @returns {React.JSX.Element} The PE header inspector UI.
 */
export default function PeHeaderInspectorTool() {
  const [base64, setBase64] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  function inspect(bytes) {
    try {
      setResult(parsePeHeaders(bytes));
      setError('');
    } catch (caughtError) {
      setResult(null);
      setError(caughtError.message);
    }
  }

  async function handleFileChange(event) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    try {
      inspect(new Uint8Array(await selectedFile.arrayBuffer()));
    } catch {
      setResult(null);
      setError('Failed to read the selected file.');
    }
  }

  function handleBase64Inspect() {
    try {
      inspect(decodeBase64Bytes(base64));
    } catch (caughtError) {
      setResult(null);
      setError(caughtError.message);
    }
  }

  function handleClear() {
    setBase64('');
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="pe-header-inspector" aria-label="PE COFF Header Inspector">
      <div className="pe-header-inspector__controls">
        <label className="pe-header-inspector__upload btn">
          Upload PE file
          <input
            ref={fileInputRef}
            type="file"
            accept=".exe,.dll,.sys"
            onChange={handleFileChange}
          />
        </label>
        <button type="button" className="btn" onClick={handleClear}>Clear</button>
      </div>
      <label htmlFor="pe-base64">PE bytes as Base64</label>
      <textarea
        id="pe-base64"
        value={base64}
        onChange={(event) => setBase64(event.target.value)}
        placeholder="Paste Base64-encoded .exe, .dll, or .sys bytes…"
        spellCheck={false}
      />
      <button
        type="button"
        className="btn pe-header-inspector__inspect"
        onClick={handleBase64Inspect}
      >
        Inspect Base64
      </button>
      {error && (
        <div className="pe-header-inspector__error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <div className="pe-header-inspector__results">
          <HeaderTable
            title="MS-DOS Stub"
            rows={[["PE header offset", result.dos.peOffset]]}
          />
          <HeaderTable
            title="COFF File Header"
            rows={[
              ['Machine', result.coff.machine],
              ['Sections', result.coff.sectionCount],
              ['Timestamp', result.coff.timestamp],
              [
                'Characteristics',
                `${result.coff.characteristics} — ${result.coff.flags.join(', ') || 'None'}`,
              ],
            ]}
          />
          <HeaderTable
            title="Optional Header"
            rows={[
              ['Format', result.optional.format],
              ['Entry point (RVA)', result.optional.entryPoint],
              ['Image base', result.optional.imageBase],
              ['Subsystem', result.optional.subsystem],
              [
                'DLL characteristics',
                `${result.optional.dllCharacteristics} — ${
                  result.optional.flags.join(', ') || 'None'
                }`,
              ],
            ]}
          />
          <section className="pe-header-inspector__group" aria-labelledby="sections-heading">
            <h2 id="sections-heading">Sections</h2>
            <div className="pe-header-inspector__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Virtual size</th>
                    <th>Virtual address</th>
                    <th>Raw size</th>
                    <th>Raw pointer</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {result.sections.map((section, index) => (
                    <tr key={`${section.name}-${index}`}>
                      <th scope="row">{section.name || '(unnamed)'}</th>
                      <td>{`0x${section.virtualSize.toString(16).toUpperCase()}`}</td>
                      <td>{`0x${section.virtualAddress.toString(16).toUpperCase()}`}</td>
                      <td>{`0x${section.rawDataSize.toString(16).toUpperCase()}`}</td>
                      <td>{`0x${section.rawDataPointer.toString(16).toUpperCase()}`}</td>
                      <td>
                        {`${section.characteristics} — ${section.flags.join(', ') || 'None'}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
