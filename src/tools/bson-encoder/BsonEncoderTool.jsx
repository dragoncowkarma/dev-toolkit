import { useEffect, useState } from 'react';
import { bytesToBase64, bytesToBase64Url, bytesToHex, encodeJsonToBson } from './bson.utils.js';
import './bson-encoder.css';

const OUTPUT_FORMATS = [
  ['hex', 'Hex'],
  ['base64', 'Base64'],
  ['base64url', 'Base64URL'],
];

/**
 * Renders a client-side JSON-to-BSON encoder with copyable byte representations.
 * @returns {React.JSX.Element}
 */
export default function BsonEncoderTool() {
  const [input, setInput] = useState('{\n  "message": "Hello BSON",\n  "active": true\n}');
  const [outputs, setOutputs] = useState({ hex: '', base64: '', base64url: '' });
  const [error, setError] = useState('');
  const [copiedFormat, setCopiedFormat] = useState('');

  useEffect(() => {
    if (input.trim() === '') {
      setOutputs({ hex: '', base64: '', base64url: '' });
      setError('');
      return;
    }
    try {
      const bytes = encodeJsonToBson(input);
      setOutputs({
        hex: bytesToHex(bytes),
        base64: bytesToBase64(bytes),
        base64url: bytesToBase64Url(bytes),
      });
      setError('');
    } catch (encodingError) {
      setOutputs({ hex: '', base64: '', base64url: '' });
      setError(encodingError.message);
    }
  }, [input]);

  useEffect(() => {
    if (!copiedFormat) return undefined;
    const timer = setTimeout(() => setCopiedFormat(''), 1500);
    return () => clearTimeout(timer);
  }, [copiedFormat]);

  async function handleCopy(format) {
    try {
      await navigator.clipboard.writeText(outputs[format]);
      setCopiedFormat(format);
    } catch {
      setError('Failed to copy to clipboard.');
    }
  }

  return (
    <section className="bson-encoder-tool" aria-label="BSON Encoder Tool">
      <div className="bson-encoder-panel">
        <label className="bson-encoder-label" htmlFor="bson-json-input">JSON document</label>
        <textarea
          id="bson-json-input"
          className="bson-encoder-textarea"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Paste a JSON object to encode…"
          spellCheck={false}
        />
      </div>

      <div className="bson-encoder-outputs" aria-label="BSON output representations">
        {OUTPUT_FORMATS.map(([format, label]) => (
          <div className="bson-encoder-panel" key={format}>
            <div className="bson-encoder-label-row">
              <label className="bson-encoder-label" htmlFor={`bson-${format}-output`}>{label}</label>
              <button
                type="button"
                className="bson-encoder-copy"
                onClick={() => handleCopy(format)}
                disabled={!outputs[format]}
              >
                {copiedFormat === format ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <textarea
              id={`bson-${format}-output`}
              className="bson-encoder-output"
              value={outputs[format]}
              readOnly
              placeholder="BSON bytes will appear here…"
              spellCheck={false}
            />
          </div>
        ))}
      </div>

      {copiedFormat && <p className="sr-only" role="status" aria-live="polite">Copied to clipboard.</p>}
      {error && <p className="bson-encoder-error" role="alert" aria-live="polite">⚠ {error}</p>}
    </section>
  );
}
