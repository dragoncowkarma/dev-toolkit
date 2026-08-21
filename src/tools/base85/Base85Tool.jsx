import { useEffect, useState } from 'react';
import { decodeFromBase85, encodeToBase85 } from './base85.utils.js';
import './base85.css';

const DIRECTIONS = {
  ENCODE: 'encode',
  DECODE: 'decode',
};

const VARIANTS = {
  ASCII85: 'ascii85',
  Z85: 'z85',
};

/**
 * Renders a client-side Ascii85 and Z85 encoder/decoder.
 * @returns {React.JSX.Element}
 */
export default function Base85Tool() {
  const [direction, setDirection] = useState(DIRECTIONS.ENCODE);
  const [variant, setVariant] = useState(VARIANTS.ASCII85);
  const [delimiters, setDelimiters] = useState(true);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (input === '') {
      setOutput('');
      setError('');
      return;
    }

    try {
      const result = direction === DIRECTIONS.ENCODE
        ? encodeToBase85(input, { variant, delimiters })
        : decodeFromBase85(input, { variant });
      setOutput(result);
      setError('');
    } catch (conversionError) {
      setOutput('');
      setError(conversionError.message);
    }
  }, [input, direction, variant, delimiters]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  function handleSwap() {
    if (error || !output) return;
    setInput(output);
    setDirection(
      direction === DIRECTIONS.ENCODE ? DIRECTIONS.DECODE : DIRECTIONS.ENCODE
    );
    setCopyError('');
  }

  function handleClear() {
    setInput('');
    setOutput('');
    setError('');
    setCopyError('');
    setCopied(false);
  }

  async function handleCopy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setCopyError('');
    } catch {
      setCopied(false);
      setCopyError('Failed to copy to clipboard.');
    }
  }

  const codecName = variant === VARIANTS.ASCII85 ? 'Ascii85' : 'Z85';
  const inputLabel = direction === DIRECTIONS.ENCODE ? 'Text' : codecName;
  const outputLabel = direction === DIRECTIONS.ENCODE ? codecName : 'Text';
  const alertMessage = error || copyError;

  return (
    <section className="base85-tool" aria-label="Base85 Encoder/Decoder Tool">
      <div className="base85-toolbar">
        <div className="base85-toggles">
          <div
            className="mode-toggle"
            role="group"
            aria-label="Conversion direction"
          >
            <button
              type="button"
              aria-pressed={direction === DIRECTIONS.ENCODE}
              className={`mode-btn ${
                direction === DIRECTIONS.ENCODE ? 'active' : ''
              }`}
              onClick={() => setDirection(DIRECTIONS.ENCODE)}
            >
              Encode
            </button>
            <button
              type="button"
              aria-pressed={direction === DIRECTIONS.DECODE}
              className={`mode-btn ${
                direction === DIRECTIONS.DECODE ? 'active' : ''
              }`}
              onClick={() => setDirection(DIRECTIONS.DECODE)}
            >
              Decode
            </button>
          </div>

          <div className="mode-toggle" role="group" aria-label="Base85 variant">
            <button
              type="button"
              aria-pressed={variant === VARIANTS.ASCII85}
              className={`mode-btn ${
                variant === VARIANTS.ASCII85 ? 'active' : ''
              }`}
              onClick={() => setVariant(VARIANTS.ASCII85)}
            >
              Ascii85
            </button>
            <button
              type="button"
              aria-pressed={variant === VARIANTS.Z85}
              className={`mode-btn ${variant === VARIANTS.Z85 ? 'active' : ''}`}
              onClick={() => setVariant(VARIANTS.Z85)}
            >
              Z85
            </button>
          </div>

          {variant === VARIANTS.ASCII85 && direction === DIRECTIONS.ENCODE && (
            <label className="delimiter-toggle">
              <input
                type="checkbox"
                checked={delimiters}
                onChange={(event) => setDelimiters(event.target.checked)}
              />
              Wrap with &lt;~ ~&gt;
            </label>
          )}
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className="btn"
            onClick={handleSwap}
            disabled={!output || !!error}
          >
            ⇅ Swap
          </button>
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <p className="base85-hint">
        {variant === VARIANTS.ASCII85
          ? 'Ascii85 accepts optional <~ ~> delimiters and the z zero-block shorthand.'
          : 'Z85 uses the ZeroMQ alphabet and requires UTF-8 input lengths divisible by 4 bytes.'}
      </p>

      <div className="base85-panels">
        <div className="panel">
          <label className="panel-label" htmlFor="base85-input">
            {inputLabel}
          </label>
          <textarea
            id="base85-input"
            className="panel-textarea"
            placeholder={
              direction === DIRECTIONS.ENCODE
                ? 'Type or paste text to encode…'
                : `Paste ${codecName} data to decode…`
            }
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setCopyError('');
            }}
            spellCheck={false}
          />
        </div>

        <div className="panel">
          <div className="panel-label-row">
            <label className="panel-label" htmlFor="base85-output">
              {outputLabel}
            </label>
            <button
              type="button"
              className="btn copy-btn"
              onClick={handleCopy}
              disabled={!output}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            {copied && (
              <div className="sr-only" role="status" aria-live="polite">
                Copied to clipboard
              </div>
            )}
          </div>
          <textarea
            id="base85-output"
            className="panel-textarea"
            value={output}
            readOnly
            placeholder="Result will appear here…"
            spellCheck={false}
          />
        </div>
      </div>

      {alertMessage && (
        <div className="base85-error" role="alert">⚠ {alertMessage}</div>
      )}
    </section>
  );
}
