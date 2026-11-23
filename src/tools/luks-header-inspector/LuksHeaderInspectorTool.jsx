import { useRef, useState } from 'react';
import { parseLuksHeader } from './luks.utils.js';
import './luks.css';

/** Render a local-only LUKS header inspector. */
export default function LuksHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const request = useRef(0);
  const input = useRef(null);

  async function inspect(file) {
    if (!file) return;
    const current = ++request.current;
    setResult(null);
    setError('');
    setName(file.name);
    try {
      const buffer = await file.slice(0, 4096).arrayBuffer();
      if (request.current !== current) return;
      setResult(parseLuksHeader(buffer));
    } catch (err) {
      if (request.current !== current) return;
      setError(err.message || 'Could not read the file.');
    }
  }

  function clear() {
    request.current += 1;
    setResult(null);
    setError('');
    setName('');
    if (input.current) input.current.value = '';
  }

  return (
    <section className="luks-tool" aria-label="LUKS Header Inspector">
      <p>Inspect a LUKS volume header locally. Files are never uploaded.</p>
      <div
        className="luks-drop"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          inspect(event.dataTransfer.files?.[0]);
        }}
      >
        <label htmlFor="luks-file">Choose a file or drop it here</label>
        <input
          id="luks-file"
          ref={input}
          type="file"
          onChange={(event) => inspect(event.target.files?.[0])}
        />
        <button type="button" onClick={clear}>Clear</button>
      </div>
      {name && <p>File: {name}</p>}
      {error && <p className="luks-error" role="alert">{error}</p>}
      {result && (
        <div>
          <h2>LUKS{result.version} header</h2>
          <dl className="luks-fields">
            {Object.entries(result.fields).map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{String(value) || '—'}</dd></div>
            ))}
          </dl>
          {result.slots && (
            <div>
              <h3>Key slots</h3>
              {result.slots.map((slot, index) => (
                <p key={index}>
                  Slot {index}: Active flag 0x{slot.active.toString(16).padStart(8, '0')};{' '}
                  iterations {slot.iterations}; stripes {slot.stripes}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
