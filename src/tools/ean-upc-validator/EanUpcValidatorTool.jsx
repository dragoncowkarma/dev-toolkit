import { useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import { analyzeBarcode, normalizeBarcode } from './eanUpcValidator.utils.js';
import './eanUpcValidator.css';

const FORMAT_OPTIONS = [
  { value: 'auto', label: 'Detect automatically' },
  { value: 'ean8', label: 'EAN-8' },
  { value: 'upc', label: 'UPC-A' },
  { value: 'ean13', label: 'EAN-13' },
];

/**
 * Renders a client-side validator and decoder for EAN-8, UPC-A, and EAN-13 barcodes.
 *
 * @returns {React.JSX.Element} The EAN/UPC validator interface.
 */
export default function EanUpcValidatorTool() {
  const [input, setInput] = useState('');
  const [formatHint, setFormatHint] = useState('auto');
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });
  const result = analyzeBarcode(input, formatHint);
  const error = copyError || result?.error || (
    result && !result.isValid ? `Invalid check digit. Expected ${result.expectedCheckDigit}.` : ''
  );

  async function handleCopy() {
    if (!result || result.error) return;
    try {
      await navigator.clipboard.writeText(result.canonicalGtin);
      setCopyError('');
      showCopied(true);
    } catch {
      setCopyError('Failed to copy the GTIN.');
    }
  }

  function handleClear() {
    setInput('');
    setCopyError('');
  }

  return (
    <section className="ean-upc-validator" aria-label="EAN and UPC Validator">
      <div className="ean-upc-validator__heading">
        <div>
          <h2>EAN / UPC Validator</h2>
          <p>Validate GS1 barcode check digits and decode their product-number structure.</p>
        </div>
        <div className="ean-upc-validator__actions">
          <button
            type="button"
            className="ean-upc-validator__button"
            disabled={!result || !!result.error || !result.isValid}
            onClick={handleCopy}
          >
            {copied ? 'Copied' : 'Copy GTIN'}
          </button>
          <button
            type="button"
            className="ean-upc-validator__button"
            onClick={handleClear}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="ean-upc-validator__controls">
        <label className="ean-upc-validator__field" htmlFor="ean-upc-input">
          <span>Barcode number</span>
          <input
            id="ean-upc-input"
            inputMode="numeric"
            onChange={(event) => {
              setInput(event.target.value);
              setCopyError('');
            }}
            placeholder="e.g. 4006381333931"
            spellCheck={false}
            value={input}
          />
        </label>
        <label className="ean-upc-validator__field" htmlFor="ean-upc-format">
          <span>Interpret as</span>
          <select
            id="ean-upc-format"
            onChange={(event) => setFormatHint(event.target.value)}
            value={formatHint}
          >
            {FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {formatHint === 'ean13' && (
        <p className="ean-upc-validator__hint">
          Enter 12 digits to calculate an EAN-13 check digit, or all 13 digits to validate it.
        </p>
      )}

      {error && <p className="ean-upc-validator__error" role="alert">{error}</p>}

      {result && !result.error && (
        <div className="ean-upc-validator__result">
          <div className="ean-upc-validator__result-header">
            <div>
              <p className="ean-upc-validator__eyebrow">{result.format}</p>
              <p className="ean-upc-validator__value">{result.fullValue}</p>
              <p
                className={result.isValid
                  ? 'ean-upc-validator__valid'
                  : 'ean-upc-validator__invalid'}
              >
                {result.isComplete
                  ? result.isValid ? 'Check digit is valid.' : 'Check digit does not match.'
                  : `Calculated check digit: ${result.checkDigit}.`}
              </p>
            </div>
          </div>

          {result.format === 'UPC-A' && (
            <p className="ean-upc-validator__gtin">
              EAN-13 / GTIN-13 representation: <strong>{result.canonicalGtin}</strong>
            </p>
          )}

          <dl className="ean-upc-validator__breakdown">
            {result.breakdown.map((part) => (
              <div key={part.label}>
                <dt>{part.label}</dt>
                <dd>{part.value}</dd>
                {part.detail && <small>{part.detail}</small>}
              </div>
            ))}
          </dl>
        </div>
      )}

      {copied && (
        <p className="sr-only" role="status" aria-live="polite">
          GTIN copied to clipboard
        </p>
      )}

      {input && !result?.error && (
        <p className="ean-upc-validator__normalized">
          Processed digits: {normalizeBarcode(input)}
        </p>
      )}
    </section>
  );
}
