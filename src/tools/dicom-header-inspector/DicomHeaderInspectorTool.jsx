import { useRef, useState } from 'react';
import { createSampleDicom, parseDicomHeader } from './dicomParser.js';
import './dicom-header-inspector.css';

function ElementsTable({ title, elements }) {
  return (
    <section className="dicom-elements" aria-labelledby={`${title}-heading`}>
      <h2 id={`${title}-heading`}>{title}</h2>
      <div className="dicom-table-wrap">
        <table>
          <thead><tr><th>Tag</th><th>Name</th><th>VR</th><th>Value</th></tr></thead>
          <tbody>
            {elements.map((element) => (
              <tr key={`${title}-${element.tag}`}>
                <td>{element.tag}</td>
                <td>{element.name}</td>
                <td>{element.vr}</td>
                <td>{element.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Renders a client-side DICOM Part 10 header inspector.
 *
 * @returns {React.JSX.Element} The DICOM header inspector UI.
 */
export default function DicomHeaderInspector() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  function inspect(buffer, name) {
    try {
      setResult(parseDicomHeader(buffer));
      setFileName(name);
      setError('');
    } catch (err) {
      setResult(null);
      setFileName('');
      setError(err.message);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    inspect(await file.arrayBuffer(), file.name);
  }

  function handleSample() {
    inspect(createSampleDicom(), 'sample.dcm');
  }

  function handleClear() {
    setResult(null);
    setError('');
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="dicom-inspector" aria-label="DICOM Header Inspector">
      <div className="dicom-actions">
        <label className="dicom-button dicom-file-button">
          Choose DICOM file
          <input
            ref={inputRef}
            type="file"
            accept=".dcm,application/dicom"
            onChange={handleFileChange}
            aria-label="Choose a DICOM file"
          />
        </label>
        <button type="button" className="dicom-button" onClick={handleSample}>
          Load Sample DICOM
        </button>
        <button type="button" className="dicom-button" onClick={handleClear}>Clear</button>
      </div>
      <p className="dicom-hint">Files are read and parsed locally in your browser.</p>
      {error && <div className="dicom-error" role="alert">{error}</div>}
      {result && (
        <div className="dicom-results">
          <p className="dicom-file-name">
            <strong>{fileName}</strong> · {result.transferSyntax}
          </p>
          <ElementsTable title="File Meta Information" elements={result.fileMeta} />
          <ElementsTable title="Data Set" elements={result.dataSet} />
        </div>
      )}
    </section>
  );
}
