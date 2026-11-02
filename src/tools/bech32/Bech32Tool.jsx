import { useEffect, useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import {
  BECH32,
  BECH32M,
  bytesToHex,
  bytesToUtf8,
  convertBits,
  decodeBech32,
  encodeBech32,
  hexToBytes,
  utf8ToBytes,
} from './bech32.utils.js';
import './bech32.css';

const MODES = { ENCODE: 'encode', DECODE: 'decode' };
const PRESETS = [
  { label: 'BIP-173: a12uel5l', value: 'a12uel5l' },
  { label: 'BIP-350: a1lqfn3a', value: 'a1lqfn3a' },
];

function formatWords(words) {
  return words.join(' ');
}

/**
 * Renders client-side Bech32 and Bech32m encoding, decoding, and checksum inspection.
 * @returns {React.JSX.Element} The Bech32 tool UI.
 */
export default function Bech32Tool() {
  const [mode, setMode] = useState(MODES.ENCODE);
  const [hrp, setHrp] = useState('bc');
  const [payload, setPayload] = useState('');
  const [payloadType, setPayloadType] = useState('text');
  const [variant, setVariant] = useState(BECH32);
  const [encodedInput, setEncodedInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });

  useEffect(() => {
    if (mode === MODES.ENCODE) {
      try {
        const bytes = payloadType === 'text' ? utf8ToBytes(payload) : hexToBytes(payload);
        const words = convertBits(bytes, 8, 5, true);
        const encoded = encodeBech32(hrp, words, variant);
        setResult({ encoded, words, checksum: encoded.slice(-6) });
        setError('');
      } catch (conversionError) {
        setResult(null);
        setError(conversionError.message);
      }
      return;
    }

    if (encodedInput === '') {
      setResult(null);
      setError('');
      return;
    }
    try {
      const decoded = decodeBech32(encodedInput);
      const bytes = Uint8Array.from(convertBits(decoded.words, 5, 8, false));
      setResult({ ...decoded, bytes, hex: bytesToHex(bytes), utf8: bytesToUtf8(bytes) });
      setError('');
    } catch (conversionError) {
      setResult(null);
      setError(conversionError.message);
    }
  }, [encodedInput, hrp, mode, payload, payloadType, variant]);

  function selectMode(nextMode) {
    setMode(nextMode);
    setError('');
    setCopyError('');
  }

  function loadPreset(value) {
    setMode(MODES.DECODE);
    setEncodedInput(value);
    setCopyError('');
  }

  async function copyValue(value) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  const alertMessage = error || copyError;

  return (
    <section className="bech32-tool" aria-label="Bech32 Encoder and Decoder">
      <div className="bech32-tool__toolbar">
        <div className="bech32-tool__toggle" role="group" aria-label="Conversion mode">
          <button
            type="button"
            className={mode === MODES.ENCODE ? 'is-active' : ''}
            aria-pressed={mode === MODES.ENCODE}
            onClick={() => selectMode(MODES.ENCODE)}
          >
            Encode
          </button>
          <button
            type="button"
            className={mode === MODES.DECODE ? 'is-active' : ''}
            aria-pressed={mode === MODES.DECODE}
            onClick={() => selectMode(MODES.DECODE)}
          >
            Decode
          </button>
        </div>
        <div className="bech32-tool__presets" aria-label="Official test vector presets">
          {PRESETS.map((preset) => (
            <button key={preset.value} type="button" onClick={() => loadPreset(preset.value)}>
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {mode === MODES.ENCODE ? (
        <div className="bech32-tool__inputs">
          <label>
            Human-readable part (HRP)
            <input
              value={hrp}
              onChange={(event) => setHrp(event.target.value)}
              maxLength="83"
              spellCheck={false}
            />
          </label>
          <label>
            Payload format
            <select value={payloadType} onChange={(event) => setPayloadType(event.target.value)}>
              <option value="text">UTF-8 text</option>
              <option value="hex">Hexadecimal bytes</option>
            </select>
          </label>
          <label>
            Target variant
            <select value={variant} onChange={(event) => setVariant(event.target.value)}>
              <option value={BECH32}>Bech32 (BIP-173)</option>
              <option value={BECH32M}>Bech32m (BIP-350)</option>
            </select>
          </label>
          <label className="bech32-tool__wide-label">
            {payloadType === 'text' ? 'UTF-8 payload' : 'Hexadecimal payload'}
            <textarea
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              maxLength="89"
              placeholder={payloadType === 'text' ? 'Type text to encode…' : '48656c6c6f'}
              spellCheck={false}
            />
          </label>
        </div>
      ) : (
        <label className="bech32-tool__decode-input">
          Bech32 or Bech32m string
          <textarea
            value={encodedInput}
            onChange={(event) => setEncodedInput(event.target.value)}
            maxLength="90"
            placeholder="Paste a Bech32 or Bech32m string…"
            spellCheck={false}
          />
        </label>
      )}

      {alertMessage && (
        <div className="bech32-tool__error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}

      {result && mode === MODES.ENCODE && (
        <section className="bech32-tool__results" aria-label="Encoding result">
          <ResultField
            label="Bech32 string"
            value={result.encoded}
            onCopy={copyValue}
            copied={copied}
          />
          <ResultField
            label="5-bit data words"
            value={formatWords(result.words)}
            onCopy={copyValue}
          />
          <ResultField
            label="6-character checksum"
            value={result.checksum}
            onCopy={copyValue}
          />
        </section>
      )}

      {result && mode === MODES.DECODE && (
        <section className="bech32-tool__results" aria-label="Decoding result">
          <ResultField
            label="Human-readable part"
            value={result.hrp}
            onCopy={copyValue}
          />
          <ResultField label="Detected variant" value={result.variant} onCopy={copyValue} />
          <ResultField
            label="5-bit data words"
            value={formatWords(result.words)}
            onCopy={copyValue}
          />
          <ResultField label="Decoded hex bytes" value={result.hex} onCopy={copyValue} />
          {result.utf8 !== null && (
            <ResultField label="UTF-8 preview" value={result.utf8} onCopy={copyValue} />
          )}
        </section>
      )}

      {copied && (
        <div className="sr-only" role="status" aria-live="polite">
          Copied to clipboard
        </div>
      )}
    </section>
  );
}

function ResultField({ label, value, onCopy, copied = false }) {
  return (
    <div className="bech32-tool__result">
      <div>
        <h3>{label}</h3>
        <div className="bech32-tool__result-value">{value || 'Empty'}</div>
      </div>
      <button
        type="button"
        onClick={() => onCopy(value)}
        disabled={!value}
        aria-label={`Copy ${label}`}
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  );
}
