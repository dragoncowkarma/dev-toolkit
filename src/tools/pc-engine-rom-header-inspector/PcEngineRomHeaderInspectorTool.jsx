import { useRef, useState } from 'react';
import { inspectRom } from './pc-engine.utils.js';
import './pc-engine.css';

function yesNo(value) {
  return value === null ? 'Unknown' : value ? 'Yes' : 'No';
}

/** @returns {React.JSX.Element} Local HuCard inspector. */
export default function PcEngineRomHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const request = useRef(0);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    const id = ++request.current;
    setResult(null);
    setError('');
    if (!file) return;
    try {
      const inspection = await inspectRom(file);
      if (id === request.current) setResult(inspection);
    } catch {
      if (id === request.current) setError('Could not read the selected file.');
    }
  }

  return (
    <section className="pce-inspector" aria-label="PC Engine ROM inspector">
      <p>Select a HuCard image. The file stays on your device.</p>
      <label htmlFor="pce-file">ROM file</label>
      <input id="pce-file" type="file" onChange={handleFile} />
      {error && <p role="alert">{error}</p>}
      {result && (
        <dl className="pce-results" aria-live="polite">
          <dt>512-byte copier header</dt><dd>{yesNo(result.hasCopierHeader)}</dd>
          <dt>ROM size</dt><dd>{result.romSize.toLocaleString()} bytes</dd>
          <dt>Complete 8 KB banks</dt><dd>{result.bankCount}</dd>
          <dt>Multiple of 8 KB</dt><dd>{yesNo(result.aligned)}</dd>
          <dt>Reset vector (last complete bank)</dt>
          <dd>
            {result.resetVector === null ? 'Unknown' : (
              `0x${result.resetVector.toString(16).toUpperCase().padStart(4, '0')}`
            )}
            {result.vectorInRange === false && ' — outside 0xE000–0xFFFF'}
          </dd>
          <dt>Bit-reversed dump (heuristic)</dt><dd>{yesNo(result.bitReversed)}</dd>
        </dl>
      )}
      <p>
        The heuristic compares the reset vector before and after reversing bits in each byte.
        If both or neither are in 0xE000–0xFFFF, the result is Unknown.
      </p>
    </section>
  );
}
