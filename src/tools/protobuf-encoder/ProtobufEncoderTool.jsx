import { useEffect, useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import { encodeProtobufJson } from './protobufEncoder.utils.js';
import './protobufEncoder.css';

const EXAMPLE_INPUT = `[
  { "field": 1, "wireType": "varint", "value": 150 },
  { "field": 2, "wireType": "length-delimited", "value": "Hello" },
  { "field": 3, "wireType": "32-bit", "value": 42 }
]`;

/**
 * Renders a client-side schema-less protobuf wire-format encoder.
 *
 * @returns {React.JSX.Element} The protobuf encoder interface.
 */
export default function ProtobufEncoderTool() {
  const [input, setInput] = useState(EXAMPLE_INPUT);
  const [result, setResult] = useState(() => encodeProtobufJson(EXAMPLE_INPUT));
  const [copied, showCopied, dismissCopied] = useCopyFeedback({
    initialValue: '',
    duration: 3000,
  });

  useEffect(() => {
    setResult(encodeProtobufJson(input));
    dismissCopied();
  }, [dismissCopied, input]);

  async function copyValue(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      showCopied(`Copied ${label} to clipboard.`);
    } catch {
      showCopied('Failed to copy to clipboard.');
    }
  }

  const output = 'error' in result ? null : result;

  return (
    <section className="protobuf-encoder" aria-label="Protobuf Wire Format Encoder">
      <div className="protobuf-encoder__intro">
        <h2>Protobuf Encoder</h2>
        <p>
          Encode schema-less field definitions locally. Repeated fields are repeated array entries;
          length-delimited values accept UTF-8 text, raw bytes, or nested fields.
        </p>
      </div>

      <label htmlFor="protobuf-encoder-input">Field definitions (JSON)</label>
      <textarea
        id="protobuf-encoder-input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        spellCheck={false}
      />
      <p className="protobuf-encoder__hint">
        Byte values: {'{ "hex": "deadbeef" }'} or {'{ "base64": "3q2+7w==" }'}.
        Nested messages: {'{ "fields": [ ... ] }'}.
      </p>

      {'error' in result && <p className="protobuf-encoder__error" role="alert">{result.error}</p>}
      {output && (
        <section className="protobuf-encoder__results" aria-labelledby="protobuf-encoder-results">
          <h3 id="protobuf-encoder-results">Encoded bytes ({output.bytes.length})</h3>
          {[
            ['Hex', output.hex],
            ['Base64', output.base64],
            ['Base64URL', output.base64url],
          ].map(([label, value]) => (
            <div className="protobuf-encoder__output" key={label}>
              <label htmlFor={`protobuf-encoder-${label.toLowerCase()}`}>{label}</label>
              <button type="button" onClick={() => copyValue(value, label)}>Copy</button>
              <textarea id={`protobuf-encoder-${label.toLowerCase()}`} value={value} readOnly />
            </div>
          ))}
        </section>
      )}
      {copied && (
        <p
          className={copied.startsWith('Failed') ? 'protobuf-encoder__error' : ''}
          role={copied.startsWith('Failed') ? 'alert' : 'status'}
          aria-live="polite"
        >
          {copied}
        </p>
      )}
    </section>
  );
}
