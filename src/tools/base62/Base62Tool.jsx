import { useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import { decodeBase62, encodeBase62 } from './base62.utils.js';
import './base62.css';

const MODES = {
  ENCODE: 'encode',
  DECODE: 'decode',
};

/**
 * Renders a BigInt-safe Base62 encoder and decoder.
 * @returns {React.JSX.Element} The Base62 tool UI.
 */
export default function Base62Tool() {
  const [mode, setMode] = useState(MODES.ENCODE);
  const [decimal, setDecimal] = useState('');
  const [base62, setBase62] = useState('');
  const [validationError, setValidationError] = useState(null);
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });

  const isDecimalInput = mode === MODES.ENCODE;
  const copyValue = isDecimalInput ? base62 : decimal;
  const isDecimalInvalid = validationError?.field === 'decimal';
  const isBase62Invalid = validationError?.field === 'base62';

  function handleDecimalChange(event) {
    const value = event.target.value;
    setMode(MODES.ENCODE);
    setDecimal(value);
    setCopyError('');

    if (value === '') {
      setBase62('');
      setValidationError(null);
      return;
    }

    try {
      setBase62(encodeBase62(value));
      setValidationError(null);
    } catch (error) {
      setBase62('');
      setValidationError({ field: 'decimal', message: error.message });
    }
  }

  function handleBase62Change(event) {
    const value = event.target.value;
    setMode(MODES.DECODE);
    setBase62(value);
    setCopyError('');

    if (value === '') {
      setDecimal('');
      setValidationError(null);
      return;
    }

    try {
      setDecimal(decodeBase62(value));
      setValidationError(null);
    } catch (error) {
      setDecimal('');
      setValidationError({ field: 'base62', message: error.message });
    }
  }

  function handleSwap() {
    if (validationError) {
      return;
    }
    setMode(isDecimalInput ? MODES.DECODE : MODES.ENCODE);
    setCopyError('');
  }

  function handleClear() {
    setMode(MODES.ENCODE);
    setDecimal('');
    setBase62('');
    setValidationError(null);
    setCopyError('');
  }

  async function handleCopy() {
    if (!copyValue) {
      return;
    }

    try {
      await navigator.clipboard.writeText(copyValue);
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  return (
    <section className="base62-tool" aria-label="Base62 Encoder/Decoder Tool">
      <div className="base62-toolbar">
        <p className="base62-direction">
          {isDecimalInput ? 'Decimal → Base62' : 'Base62 → Decimal'}
        </p>
        <div className="base62-actions">
          <button
            type="button"
            className="base62-button"
            onClick={handleCopy}
            disabled={!copyValue || Boolean(validationError)}
            title={`Copy ${isDecimalInput ? 'Base62' : 'decimal'} result`}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button
            type="button"
            className="base62-button"
            onClick={handleSwap}
            disabled={Boolean(validationError)}
            title="Swap conversion direction"
          >
            ⇄ Swap
          </button>
          <button type="button" className="base62-button" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="base62-panels">
        <div className="base62-panel">
          <label className="base62-label" htmlFor="base62-decimal">
            Decimal {isDecimalInput ? 'input' : 'result'}
          </label>
          <textarea
            id="base62-decimal"
            className="base62-textarea"
            value={decimal}
            onChange={isDecimalInput ? handleDecimalChange : undefined}
            readOnly={!isDecimalInput}
            aria-invalid={isDecimalInvalid ? 'true' : undefined}
            aria-describedby={isDecimalInvalid ? 'base62-decimal-error' : undefined}
            placeholder={isDecimalInput ? 'Enter a non-negative whole number…' : 'Result'}
            inputMode="numeric"
            spellCheck={false}
          />
        </div>

        <div className="base62-panel">
          <label className="base62-label" htmlFor="base62-value">
            Base62 {isDecimalInput ? 'result' : 'input'}
          </label>
          <textarea
            id="base62-value"
            className="base62-textarea"
            value={base62}
            onChange={!isDecimalInput ? handleBase62Change : undefined}
            readOnly={isDecimalInput}
            aria-invalid={isBase62Invalid ? 'true' : undefined}
            aria-describedby={isBase62Invalid ? 'base62-base62-error' : undefined}
            placeholder={isDecimalInput ? 'Result' : 'Enter Base62 using 0-9, a-z, A-Z…'}
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>
      </div>

      {validationError && (
        <p
          id={`base62-${validationError.field}-error`}
          className="base62-error"
          role="alert"
        >
          {validationError.message}
        </p>
      )}
      {copyError && (
        <p className="base62-error" role="alert">
          {copyError}
        </p>
      )}
      {copied && (
        <p className="sr-only" role="status" aria-live="polite">
          Copied to clipboard.
        </p>
      )}
    </section>
  );
}
