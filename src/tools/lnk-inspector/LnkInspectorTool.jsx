import { useRef, useState } from 'react';
import { parseLnk } from './lnk.utils.js';
import './lnk.css';

function displayValue(value) {
  if (Array.isArray(value)) {
    const list = value.join(', ');
    return list === '' ? 'None' : list;
  }

  return value === '' || value === null || value === undefined ? 'None' : String(value);
}

function Details({ title, values }) {
  return (
    <section className="lnk-section">
      <h2>{title}</h2>
      <dl>
        {Object.entries(values).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{displayValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Renders a local-only Windows shortcut inspector. */
export default function LnkInspectorTool() {
  const inputRef = useRef(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  async function inspect(file) {
    if (!file) return;
    try {
      setResult(parseLnk(await file.arrayBuffer()));
      setFileName(file.name);
      setError('');
    } catch (caught) {
      setResult(null);
      setFileName(file.name);
      setError(caught instanceof Error ? caught.message : 'Unable to parse this .lnk file.');
    }
  }

  function onDrop(event) {
    event.preventDefault();
    inspect(event.dataTransfer.files[0]);
  }

  function openPicker() {
    inputRef.current?.click();
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  }

  const linkInfoValues = result?.linkInfo && {
    'Byte length': result.linkInfo.size,
    Flags: result.linkInfo.flags,
    'Local base path': result.linkInfo.localBasePath,
    'Common path suffix': result.linkInfo.commonPathSuffix,
  };

  return (
    <section className="lnk-inspector" aria-label="Windows Shortcut Inspector">
      <input
        ref={inputRef}
        className="lnk-file-input"
        type="file"
        accept=".lnk"
        aria-label="Choose a Windows shortcut file"
        onChange={(event) => inspect(event.target.files?.[0])}
      />
      <div
        className="lnk-drop-zone"
        role="button"
        tabIndex="0"
        onClick={openPicker}
        onKeyDown={handleKeyDown}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <strong>Choose or drop a .lnk file</strong>
        <span>Parsed entirely in your browser. Nothing is uploaded.</span>
      </div>
      {fileName && <p className="lnk-file-name">Inspecting: {fileName}</p>}
      {error && (
        <div role="alert" className="lnk-alert">
          ⚠ {error}
        </div>
      )}
      {result && (
        <div className="lnk-results">
          <Details title="ShellLinkHeader" values={result.header} />
          {result.targetIdList && (
            <Details
              title="LinkTargetIDList"
              values={{ 'Byte length': result.targetIdList.size }}
            />
          )}
          {result.linkInfo && <Details title="LinkInfo" values={linkInfoValues} />}
          {result.linkInfo?.volume && (
            <Details title="VolumeID" values={result.linkInfo.volume} />
          )}
          {result.linkInfo?.network && (
            <Details title="CommonNetworkRelativeLink" values={result.linkInfo.network} />
          )}
          {Object.keys(result.stringData).length > 0 && (
            <Details
              title={`StringData (${result.stringEncoding})`}
              values={result.stringData}
            />
          )}
        </div>
      )}
    </section>
  );
}
