import { useRef, useState } from 'react';
import { decodeHex, parseSwapHeader, readFirstPage } from './swap.utils.js';
import './swap.css';

/** Render the Linux swap header inspector. */
export default function LinuxSwapHeaderInspector() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const request = useRef(0);
  const fileInput = useRef(null);

  function inspect(bytes) {
    try {
      setResult(parseSwapHeader(bytes));
      setError('');
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  function handleText(event) {
    request.current += 1;
    const value = event.target.value;
    setInput(value);
    setFileName('');
    if (fileInput.current) fileInput.current.value = '';
    if (!value.trim()) {
      setResult(null);
      setError('');
      return;
    }
    try {
      inspect(decodeHex(value));
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const id = ++request.current;
    setInput('');
    setFileName(file.name);
    setResult(null);
    setError('');
    try {
      const bytes = await readFirstPage(file);
      if (request.current === id) inspect(bytes);
    } catch (err) {
      if (request.current === id) setError(err.message);
    }
  }

  function clear() {
    request.current += 1;
    setInput('');
    setFileName('');
    setResult(null);
    setError('');
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <section className="swap-tool" aria-label="Linux Swap Header Inspector">
      <p>Inspect the first 4096-byte swap page locally. Files never leave your browser.</p>
      <div className="swap-actions">
        <label className="swap-button">
          Choose file
          <input ref={fileInput} type="file" aria-label="Choose swap file" onChange={handleFile} />
        </label>
        <button className="swap-button" type="button" onClick={clear}>Clear</button>
        {fileName && <span>Selected: {fileName}</span>}
      </div>
      <label htmlFor="swap-hex">Or paste hexadecimal bytes</label>
      <textarea id="swap-hex" value={input} onChange={handleText} spellCheck={false} />
      {error && <div className="swap-error" role="alert">{error}</div>}
      {result && (
        <div className="swap-results">
          <h2>Swap header</h2>
          <dl>
            <dt>Signature</dt><dd>{result.signature}</dd>
            <dt>Version</dt><dd>{result.version} ({result.byteOrder})</dd>
            <dt>Last page</dt><dd>{result.lastPage}</dd>
            <dt>Swap size</dt><dd>{result.sizeHuman} ({result.sizeBytes} bytes)</dd>
            <dt>UUID</dt><dd>{result.uuid}</dd>
            <dt>Volume label</dt><dd>{result.label || '(empty)'}</dd>
            <dt>Bad pages declared</dt><dd>{result.badPageCount}</dd>
            <dt>Bad pages listed</dt><dd>{result.badPages.length}</dd>
          </dl>
          <details>
            <summary>Padding (117 unsigned 32-bit values)</summary>
            <p className="swap-values">{result.padding.join(', ')}</p>
          </details>
          <details>
            <summary>Bad-page table</summary>
            <p className="swap-values">{result.badPages.join(', ') || '(none)'}</p>
          </details>
        </div>
      )}
    </section>
  );
}
