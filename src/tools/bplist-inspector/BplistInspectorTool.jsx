import { useRef, useState } from 'react';
import { parseBplist, readBplistFile } from './bplist-inspector.utils.js';
import './bplist-inspector.css';

/**
 * Renders a browser-only inspector for Apple bplist00 files.
 *
 * @returns {React.JSX.Element} The binary plist inspector UI.
 */
export default function BplistInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const requestRef = useRef(0);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const request = (requestRef.current += 1);
    try {
      const bytes = await readBplistFile(file);
      if (request !== requestRef.current) return;
      setResult(parseBplist(bytes));
      setFileName(file.name);
      setError('');
    } catch (caughtError) {
      if (request !== requestRef.current) return;
      setResult(null);
      setFileName(file.name);
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to inspect this file.');
    }
  }

  function handleClear() {
    requestRef.current += 1;
    setResult(null);
    setError('');
    setFileName('');
  }

  return (
    <section className="bplist-inspector" aria-label="Apple Binary Property List Inspector">
      <div className="bplist-inspector__toolbar">
        <label className="bplist-inspector__file-button">
          Select bplist00 File
          <input type="file" onChange={handleFileChange} aria-label="Select a bplist00 file" />
        </label>
        <button type="button" className="bplist-inspector__clear" onClick={handleClear}>
          Clear
        </button>
      </div>

      <p className="bplist-inspector__privacy">Files are parsed locally in your browser.</p>
      {fileName && <p className="bplist-inspector__filename">{fileName}</p>}
      {error && <div className="bplist-inspector__error" role="alert">⚠ {error}</div>}
      {result && <InspectionResult result={result} />}
    </section>
  );
}

function InspectionResult({ result }) {
  return (
    <div className="bplist-inspector__results">
      <h2>Trailer</h2>
      <dl className="bplist-inspector__trailer">
        {Object.entries(result.trailer).map(([name, value]) => (
          <div key={name}><dt>{toLabel(name)}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <h2>Object Tree</h2>
      <pre className="bplist-inspector__tree">{JSON.stringify(result.root, null, 2)}</pre>
    </div>
  );
}

function toLabel(name) {
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}
