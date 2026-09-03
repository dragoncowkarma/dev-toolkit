import { useEffect, useState } from 'react';
import { decodeFromBase36, encodeToBase36 } from './base36.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './base36.css';

const MODES = {
  ENCODE: 'encode',
  DECODE: 'decode',
};

/**
 * Renders the Base36 encoder/decoder with live BigInt-safe conversion.
 * @returns {React.JSX.Element} The Base36 tool UI.
 */
export default function Base36Tool() {
  const [mode, setMode] = useState(MODES.ENCODE);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });

  useEffect(() => {
    if (input === '') {
      setOutput('');
      setError('');
      return;
    }

    try {
      const result = mode === MODES.ENCODE
        ? encodeToBase36(input)
        : decodeFromBase36(input).toString();
      setOutput(result);
      setError('');
    } catch (conversionError) {
      setOutput('');
      setError(conversionError.message);
    }
  }, [input, mode]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setInput('');
    setOutput('');
    setError('');
    setCopyError('');
  }

  function handleSwap() {
    if (error || !output) return;
    setInput(output);
    setMode(mode === MODES.ENCODE ? MODES.DECODE : MODES.ENCODE);
    setCopyError('');
  }

  function handleClear() {
    setInput('');
    setOutput('');
    setError('');
    setCopyError('');
  }

  async function handleCopy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  const inputLabel = mode === MODES.ENCODE ? 'Decimal integer' : 'Base36';
  const outputLabel = mode === MODES.ENCODE ? 'Base36' : 'Decimal integer';
  const alertMessage = error || copyError;

  return (
    <section className="base36-tool" aria-label="Base36 Encoder/Decoder Tool">
      <div className="base36-tool__toolbar">
        <div className="base36-tool__mode-toggle" role="group" aria-label="Conversion mode">
          <button
            type="button"
            aria-pressed={mode === MODES.ENCODE}
            className={`base36-tool__mode-button ${mode === MODES.ENCODE ? 'is-active' : ''}`}
            onClick={() => handleModeChange(MODES.ENCODE)}
          >
            Encode
          </button>
          <button
            type="button"
            aria-pressed={mode === MODES.DECODE}
            className={`base36-tool__mode-button ${mode === MODES.DECODE ? 'is-active' : ''}`}
            onClick={() => handleModeChange(MODES.DECODE)}
          >
            Decode
          </button>
        </div>

        <div className="base36-tool__actions">
          <button type="button" className="base36-tool__button" onClick={handleSwap}
            disabled={!output || !!error}>
            ⇅ Swap
          </button>
          <button type="button" className="base36-tool__button" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <p className="base36-tool__hint">
        Base36 uses digits 0-9 and letters A-Z. Input letters are case-insensitive.
      </p>

      <div className="base36-tool__panels">
        <div className="base36-tool__panel">
          <label className="base36-tool__label" htmlFor="base36-input">{inputLabel}</label>
          <textarea
            id="base36-input"
            className="base36-tool__textarea"
            placeholder={mode === MODES.ENCODE
              ? 'Enter a non-negative integer…'
              : 'Enter a Base36 value…'}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'base36-error' : undefined}
            spellCheck={false}
          />
        </div>

        <div className="base36-tool__panel">
          <div className="base36-tool__output-label-row">
            <label className="base36-tool__label" htmlFor="base36-output">{outputLabel}</label>
            <button type="button" className="base36-tool__button base36-tool__copy-button"
              onClick={handleCopy} disabled={!output}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            {copied && (
              <span className="sr-only" role="status" aria-live="polite">Copied to clipboard</span>
            )}
          </div>
          <textarea
            id="base36-output"
            className="base36-tool__textarea"
            value={output}
            readOnly
            placeholder="Result will appear here…"
            spellCheck={false}
          />
        </div>
      </div>

      {alertMessage && (
        <div id="base36-error" className="base36-tool__error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}
    </section>
  );
}
