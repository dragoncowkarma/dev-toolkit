import { useEffect, useState } from 'react';
import {
  decodeProtobuf,
  formatDecodedTree,
  parsePayload,
} from './protobufDecoder.utils.js';
import './protobufDecoder.css';

const SAMPLE_HEX =
  '089601120774657374696e671a0308960120ffffffffffffffffff012d0000803f31000000000000f83f';

function Value({ name, value, onCopy }) {
  return (
    <div className="protobuf-decoder__value">
      <span>{name}</span>
      <code>{typeof value === 'string' ? value : JSON.stringify(value)}</code>
      <button type="button" onClick={() => onCopy(String(value))} aria-label={`Copy ${name}`}>
        Copy
      </button>
    </div>
  );
}

function FieldTree({ fields, onCopy, level = 0 }) {
  const [openFields, setOpenFields] = useState(() => new Set(fields.map((field) => field.offset)));

  function toggle(offset) {
    setOpenFields((current) => {
      const next = new Set(current);
      if (next.has(offset)) next.delete(offset);
      else next.add(offset);
      return next;
    });
  }

  return (
    <ol
      className="protobuf-decoder__tree"
      aria-label={level ? 'Nested protobuf fields' : 'Decoded fields'}
    >
      {fields.map((field) => {
        const isOpen = openFields.has(field.offset);
        return (
          <li
            className="protobuf-decoder__field"
            key={`${level}-${field.offset}-${field.fieldNumber}`}
          >
            <button
              type="button"
              className="protobuf-decoder__field-header"
              aria-expanded={isOpen}
              onClick={() => toggle(field.offset)}
            >
              <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
              <strong>Field {field.fieldNumber}</strong>
              <span>{field.wireTypeName}</span>
              <span>byte {field.offset}</span>
              {field.bestGuess && <em>best guess: {field.bestGuess}</em>}
            </button>
            {isOpen && (
              <div className="protobuf-decoder__field-details">
                {Object.entries(field.interpretations).map(([name, value]) => {
                  if (name === 'submessage') {
                    return (
                      <section key={name} className="protobuf-decoder__nested">
                        <p>submessage (also available as raw hex)</p>
                        <FieldTree fields={value} onCopy={onCopy} level={level + 1} />
                      </section>
                    );
                  }
                  return <Value key={name} name={name} value={value} onCopy={onCopy} />;
                })}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Renders a local, schema-less Protocol Buffers wire-format decoder.
 * @returns {React.JSX.Element} The protobuf decoder interface.
 */
export default function ProtobufDecoderTool() {
  const [input, setInput] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('auto');
  const [resolvedFormat, setResolvedFormat] = useState('hex');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    if (!input.trim()) {
      setResult(null);
      setError('');
      return;
    }
    const parsed = parsePayload(input, selectedFormat);
    setResolvedFormat(parsed.format);
    if ('error' in parsed) {
      setResult(null);
      setError(parsed.error);
      return;
    }
    const decoded = decodeProtobuf(parsed.bytes);
    if ('error' in decoded) {
      setResult(null);
      setError(decoded.error);
      return;
    }
    setError('');
    setResult(decoded);
  }, [input, selectedFormat]);

  useEffect(() => {
    if (!copyStatus) return undefined;
    const timer = setTimeout(() => setCopyStatus(''), 1800);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus('Copied to clipboard.');
    } catch {
      setCopyStatus('Failed to copy to clipboard.');
    }
  }

  function clear() {
    setInput('');
    setCopyStatus('');
  }

  return (
    <section className="protobuf-decoder" aria-label="Protobuf Wire Format Decoder">
      <div className="protobuf-decoder__intro">
        <p>Decode raw Protocol Buffers bytes locally. No schema or network call is required.</p>
      </div>
      <div className="protobuf-decoder__controls">
        <label htmlFor="protobuf-format">Payload format</label>
        <select
          id="protobuf-format"
          value={selectedFormat}
          onChange={(event) => setSelectedFormat(event.target.value)}
        >
          <option value="auto">Auto</option>
          <option value="hex">Hex</option>
          <option value="base64">Base64 / Base64url</option>
        </select>
        <span className="protobuf-decoder__resolved">Resolved: {resolvedFormat}</span>
        <button type="button" onClick={() => setInput(SAMPLE_HEX)}>Load sample</button>
        <button type="button" onClick={clear}>Clear</button>
      </div>
      <label htmlFor="protobuf-payload">Protobuf payload</label>
      <textarea
        id="protobuf-payload"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Paste hexadecimal or Base64 payload bytes"
        spellCheck={false}
      />
      {error && <p className="protobuf-decoder__error" role="alert">{error}</p>}
      {copyStatus && (
        <p
          className={copyStatus.startsWith('Failed') ? 'protobuf-decoder__error' : ''}
          role={copyStatus.startsWith('Failed') ? 'alert' : 'status'}
          aria-live="polite"
        >
          {copyStatus}
        </p>
      )}
      {result && (
        <section className="protobuf-decoder__results" aria-labelledby="protobuf-results-heading">
          <div className="protobuf-decoder__results-header">
            <h3 id="protobuf-results-heading">
              Decoded field tree ({result.fields.length} fields)
            </h3>
            <button type="button" onClick={() => copy(formatDecodedTree(result.fields))}>
              Copy whole tree
            </button>
          </div>
          {result.fields.length ? (
            <FieldTree fields={result.fields} onCopy={copy} />
          ) : (
            <p>Empty message.</p>
          )}
        </section>
      )}
    </section>
  );
}
