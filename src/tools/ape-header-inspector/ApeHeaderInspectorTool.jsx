import { useRef, useState } from 'react';
import { parseApeHeader } from './apeHeader.utils.js';
import './apeHeaderInspector.css';

/**
 * Renders a browser-only inspector for Monkey's Audio file headers.
 * @returns {React.JSX.Element} The APE header inspector UI.
 */
export default function ApeHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      setResult(parseApeHeader(buffer));
      setFileName(file.name);
      setError('');
    } catch (caughtError) {
      setResult(null);
      setFileName(file.name);
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to inspect the file.');
    }
  }

  function handleFileChange(event) {
    inspectFile(event.target.files?.[0]);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    inspectFile(event.dataTransfer.files?.[0]);
  }

  function handleClear() {
    setResult(null);
    setError('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="ape-header-inspector" aria-label="APE Header Inspector">
      <div
        className={`ape-header-inspector__drop-zone ${isDragging ? 'is-dragging' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <p>Drop a Monkey&apos;s Audio (.ape) file here</p>
        <span>or</span>
        <label className="ape-header-inspector__button">
          Choose file
          <input
            ref={fileInputRef}
            type="file"
            accept=".ape,audio/ape"
            onChange={handleFileChange}
            aria-label="Choose an APE file to inspect"
          />
        </label>
      </div>

      {(fileName || result || error) && (
        <div className="ape-header-inspector__toolbar">
          <span>{fileName}</span>
          <button type="button" className="ape-header-inspector__button" onClick={handleClear}>
            Clear
          </button>
        </div>
      )}

      {error && <div className="ape-header-inspector__error" role="alert">⚠ {error}</div>}

      {result && (
        <div className="ape-header-inspector__result">
          <h2>{result.layout}</h2>
          <dl>
            {result.fields.map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
