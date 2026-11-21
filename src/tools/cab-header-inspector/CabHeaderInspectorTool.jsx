import { useRef, useState } from 'react';
import { parseCabHeader } from './cab-header-inspector.utils.js';
import './cab-header-inspector.css';

function Details({ title, values }) {
  return (
    <section className="cab-inspector__section">
      <h3>{title}</h3>
      <dl>
        {values.map(([name, value]) => (
          <div key={name}><dt>{name}</dt><dd>{String(value)}</dd></div>
        ))}
      </dl>
    </section>
  );
}

/** Renders a drag-and-drop Microsoft Cabinet header inspector. @returns {React.JSX.Element} */
export default function CabHeaderInspector() {
  const inputRef = useRef(null);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('Choose a .cab file to inspect its header.');
  const [error, setError] = useState('');

  async function inspect(file) {
    if (!file) return;
    try {
      const parsed = parseCabHeader(await file.arrayBuffer());
      setResult(parsed);
      setError('');
      const summary = `${parsed.files.length} file(s), ${parsed.folders.length} folder(s)`;
      setStatus(`Inspected ${file.name}: ${summary}.`);
    } catch (inspectionError) {
      setResult(null);
      setError(inspectionError.message);
      setStatus(`Could not inspect ${file.name}.`);
    }
  }

  function handleDrop(event) { event.preventDefault(); inspect(event.dataTransfer.files?.[0]); }
  function handleKeyDown(event) {
    if ((event.key === 'Enter' || event.key === ' ') && inputRef.current) {
      event.preventDefault();
      inputRef.current.click();
    }
  }

  return <section className="cab-inspector" aria-label="CAB Header Inspector">
    <div className="cab-inspector__drop-zone" role="button" tabIndex="0" onDrop={handleDrop}
      onDragOver={(event) => event.preventDefault()} onKeyDown={handleKeyDown}
      onClick={() => inputRef.current?.click()}>
      <input ref={inputRef} type="file" accept=".cab,application/vnd.ms-cab-compressed"
        aria-label="Select a CAB file" onChange={(event) => inspect(event.target.files?.[0])} />
      <strong>Drop a CAB file here</strong><span>or click to select one</span>
    </div>
    <p className="cab-inspector__status" aria-live="polite">{status}</p>
    {error && <div className="cab-inspector__error" role="alert">{error}</div>}
    {result && <div className="cab-inspector__results">
      <Details title="CFHEADER" values={Object.entries(result.header)} />
      <Details title="Reserved and linked cabinets" values={[
        ...Object.entries(result.reserved), ...Object.entries(result.links),
        ['nameEncoding', result.nameEncoding],
      ]} />
      {result.folders.map((folder, index) => (
        <Details key={`folder-${index}`} title={`CFFOLDER ${index + 1}`}
          values={Object.entries(folder)} />
      ))}
      {result.files.map((file, index) => (
        <Details key={`file-${index}`} title={`CFFILE ${index + 1}`}
          values={Object.entries(file)} />
      ))}
    </div>}
  </section>;
}
