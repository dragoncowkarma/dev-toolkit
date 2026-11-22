import { useRef, useState } from 'react';
import { inspectAniHeader } from './aniHeader.utils.js';
import './ani-header-inspector.css';

/**
 * Renders a client-side Windows ANI RIFF header inspector.
 * @returns {React.JSX.Element} The ANI inspector interface.
 */
export default function AniHeaderInspectorTool() {
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [readError, setReadError] = useState('');
  const inputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setFileName(file.name);
      setResult(inspectAniHeader(await file.arrayBuffer()));
      setReadError('');
    } catch {
      setResult(null);
      setReadError('The selected file could not be read.');
    }
  }

  function handleClear() {
    setFileName('');
    setResult(null);
    setReadError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="ani-header-inspector" aria-label="ANI Header Inspector">
      <div className="ani-header-inspector__toolbar">
        <label className="ani-header-inspector__file-button">
          Choose ANI File
          <input
            ref={inputRef}
            type="file"
            accept=".ani,application/octet-stream"
            onChange={handleFileChange}
            aria-label="Choose ANI file"
          />
        </label>
        <button type="button" onClick={handleClear}>Clear</button>
      </div>

      {fileName && <p className="ani-header-inspector__filename">Inspecting: {fileName}</p>}
      {readError && <p className="ani-header-inspector__error" role="alert">{readError}</p>}

      {result && (
        <div className="ani-header-inspector__results">
          <h2>RIFF Container</h2>
          <dl>
            <dt>Form type</dt><dd>{result.formType ?? 'Unavailable'}</dd>
            <dt>Declared RIFF size</dt><dd>{result.riffSize ?? 'Unavailable'}</dd>
            <dt>Frame chunks</dt><dd>{result.frames.length}</dd>
            <dt>Rate values</dt>
            <dd>{result.rates.length ? result.rates.join(', ') : 'None'}</dd>
            <dt>Sequence values</dt>
            <dd>{result.sequence.length ? result.sequence.join(', ') : 'None'}</dd>
          </dl>

          {result.header && (
            <>
              <h2>ANIHEADER</h2>
              <dl>
                <dt>Frames / steps</dt>
                <dd>{result.header.frameCount} / {result.header.stepCount}</dd>
                <dt>Dimensions</dt><dd>{result.header.width} × {result.header.height}</dd>
                <dt>Bit count / planes</dt>
                <dd>{result.header.bitCount} / {result.header.planes}</dd>
                <dt>Default jiffy rate</dt><dd>{result.header.defaultJiffyRate}</dd>
                <dt>Flags</dt><dd>0x{result.header.flags.toString(16).padStart(8, '0')}</dd>
                <dt>Frame encoding</dt>
                <dd>
                  {result.header.framesAreIconImages ? 'ICO/CUR images' : 'Raw bitmap data'}
                </dd>
              </dl>
            </>
          )}

          <h2>Diagnostics</h2>
          {result.diagnostics.length ? (
            <ul className="ani-header-inspector__diagnostics" role="alert">
              {result.diagnostics.map((diagnostic) => <li key={diagnostic}>{diagnostic}</li>)}
            </ul>
          ) : <p className="ani-header-inspector__valid">No structural problems found.</p>}
        </div>
      )}
    </section>
  );
}
