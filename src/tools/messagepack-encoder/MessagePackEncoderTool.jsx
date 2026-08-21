import { useEffect, useState } from 'react';
import {
  MESSAGEPACK_ENCODER_SAMPLES,
  encodeMessagePack,
  formatMessagePackOutputs,
  parseMessagePackEncoderInput,
} from './messagepackEncoder.utils.js';
import './messagepackEncoder.css';

/**
 * Renders a browser-only JSON-to-MessagePack encoder.
 *
 * @returns {React.JSX.Element} The MessagePack encoder interface.
 */
export default function MessagePackEncoderTool() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    if (!input.trim()) {
      setResult(null);
      setError('');
      return;
    }
    const parsed = parseMessagePackEncoderInput(input);
    if ('error' in parsed) {
      setResult(null);
      setError(parsed.error);
      return;
    }
    const encoded = encodeMessagePack(parsed.value);
    if ('error' in encoded) {
      setResult(null);
      setError(encoded.error);
      return;
    }
    setResult({ bytes: encoded.bytes, ...formatMessagePackOutputs(encoded.bytes) });
    setError('');
  }, [input]);

  useEffect(() => {
    if (!copyStatus) return undefined;
    const timer = setTimeout(() => setCopyStatus(''), 1800);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  async function copy(value) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API is unavailable.');
      await navigator.clipboard.writeText(value);
      setCopyStatus('Copied to clipboard.');
    } catch {
      setCopyStatus('Failed to copy to clipboard.');
    }
  }

  const alertMessage = error || (copyStatus.startsWith('Failed') ? copyStatus : '');

  return (
    <section className="messagepack-encoder" aria-label="MessagePack Encoder">
      <p className="messagepack-encoder__intro">
        Encode JSON as MessagePack locally. JSON is the sole input syntax because MessagePack has
        no standardized diagnostic notation.
      </p>
      <div className="messagepack-encoder__controls">
        <button type="button" onClick={() => setInput('')}>Clear</button>
      </div>
      <div className="messagepack-encoder__samples" aria-label="MessagePack encoder samples">
        {MESSAGEPACK_ENCODER_SAMPLES.map((sample) => (
          <button type="button" key={sample.id} onClick={() => setInput(sample.value)}>
            {sample.label}
          </button>
        ))}
      </div>
      <label htmlFor="messagepack-encoder-input">JSON value</label>
      <textarea
        id="messagepack-encoder-input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder='{"hello":"world"}'
        spellCheck={false}
      />
      {alertMessage && <p className="messagepack-encoder__error" role="alert">{alertMessage}</p>}
      {copyStatus && !alertMessage && <p role="status" aria-live="polite">{copyStatus}</p>}
      {result && (
        <section className="messagepack-encoder__results" aria-labelledby="messagepack-results">
          <header className="messagepack-encoder__results-header">
            <div>
              <h3 id="messagepack-results">Encoded MessagePack</h3>
              <p>{result.bytes.length} byte{result.bytes.length === 1 ? '' : 's'} encoded</p>
            </div>
          </header>
          <div className="messagepack-encoder__outputs">
            {[
              ['Hex', 'hex'],
              ['Base64', 'base64'],
              ['Base64URL', 'base64url'],
            ].map(([label, key]) => (
              <div key={key}>
                <div className="messagepack-encoder__output-label">
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
