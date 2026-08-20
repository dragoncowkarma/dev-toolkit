import { useEffect, useState } from 'react';
import {
  CBOR_ENCODER_SAMPLES,
  encodeCbor,
  formatCborOutputs,
  parseCborEncoderInput,
} from './cborEncoder.utils.js';
import './cborEncoder.css';

/**
 * Renders a browser-only RFC 8949 CBOR encoder for JSON and diagnostic notation.
 *
 * @returns {React.JSX.Element} The CBOR encoder interface.
 */
export default function CborEncoderTool() {
  const [input, setInput] = useState('');
  const [format, setFormat] = useState('json');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    if (!input.trim()) {
      setResult(null);
      setError('');
      return;
    }
    const parsed = parseCborEncoderInput(input, format);
    if ('error' in parsed) {
      setResult(null);
      setError(parsed.error);
      return;
    }
    const encoded = encodeCbor(parsed.value);
    if ('error' in encoded) {
      setResult(null);
      setError(encoded.error);
      return;
    }
    setResult({
      bytes: encoded.bytes,
      ...formatCborOutputs(encoded.bytes),
    });
    setError('');
  }, [format, input]);

  useEffect(() => {
    if (!copyStatus) return undefined;
    const timer = setTimeout(() => setCopyStatus(''), 1800);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  function loadSample(sample) {
    setFormat(sample.format);
    setInput(sample.value);
    setCopyStatus('');
  }

  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus('Copied to clipboard.');
    } catch {
      setCopyStatus('Failed to copy to clipboard.');
    }
  }

  const alertMessage = error || (copyStatus.startsWith('Failed') ? copyStatus : '');

  return (
    <section className="cbor-encoder" aria-label="CBOR Encoder">
      <p className="cbor-encoder__intro">
        Encode RFC 8949 CBOR locally. Use JSON for ordinary values or diagnostic notation for
        explicit byte strings such as h&apos;deadbeef&apos;.
      </p>
      <div className="cbor-encoder__controls">
        <label htmlFor="cbor-encoder-format">Input syntax</label>
        <select
          id="cbor-encoder-format"
          value={format}
          onChange={(event) => setFormat(event.target.value)}
        >
          <option value="json">JSON</option>
          <option value="diagnostic">Diagnostic notation</option>
        </select>
        <button type="button" onClick={() => setInput('')}>Clear</button>
      </div>
      <div className="cbor-encoder__samples" aria-label="CBOR encoder samples">
        {CBOR_ENCODER_SAMPLES.map((sample) => (
          <button type="button" key={sample.id} onClick={() => loadSample(sample)}>
            {sample.label}
          </button>
        ))}
      </div>
      <label htmlFor="cbor-encoder-input">CBOR value</label>
      <textarea
        id="cbor-encoder-input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={'{"hello":"world"} or {"bytes": h\'deadbeef\'}'}
        spellCheck={false}
      />
      {alertMessage && <p className="cbor-encoder__error" role="alert">{alertMessage}</p>}
      {copyStatus && !alertMessage && <p role="status" aria-live="polite">{copyStatus}</p>}
      {result && (
        <section className="cbor-encoder__results" aria-labelledby="cbor-encoder-results">
          <header className="cbor-encoder__results-header">
            <div>
              <h3 id="cbor-encoder-results">Encoded CBOR</h3>
              <p>{result.bytes.length} byte{result.bytes.length === 1 ? '' : 's'} encoded</p>
            </div>
          </header>
          <div className="cbor-encoder__outputs">
            {[
              ['Hex', 'hex'],
              ['Base64', 'base64'],
              ['Base64URL', 'base64url'],
            ].map(([label, key]) => (
              <div key={key}>
                <div className="cbor-encoder__output-label">
                  <h4>{label}</h4>
                  <button type="button" onClick={() => copy(result[key])}>Copy {label}</button>
                </div>
                <pre aria-label={`${label} output`}>{result[key]}</pre>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
