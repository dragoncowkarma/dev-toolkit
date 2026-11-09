import { useState } from 'react';
import { SAMPLE_ISINS, validateIsin } from './isin.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './isin-validator.css';

/**
 * Renders the client-side ISIN (ISO 6166) validator tool with live validation,
 * format inspection, and checksum verification.
 *
 * @returns {React.JSX.Element} The ISIN Validator UI.
 */
export default function IsinValidatorTool() {
  const [input, setInput] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });

  const result = validateIsin(input);

  function handleInputChange(event) {
    setInput(event.target.value);
    setCopyError('');
  }

  function handleClear() {
    setInput('');
    setCopyError('');
  }

  function handleLoadSample(sampleValue) {
    setInput(sampleValue);
    setCopyError('');
  }

  async function handleCopy() {
    const textToCopy = input.trim();
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  const alertMessage = copyError || result.errorMessage;
  const isInputEmpty = input.trim().length === 0;

  return (
    <section className="isin-tool" aria-label="ISIN Validator Tool">
      <div className="isin-tool__toolbar">
        <div className="isin-tool__samples" role="group" aria-label="Sample ISINs">
          <span className="isin-tool__samples-label">Samples:</span>
          {SAMPLE_ISINS.map((sample) => (
            <button
              key={sample.value}
              type="button"
              className="btn btn--sample"
              onClick={() => handleLoadSample(sample.value)}
            >
              {sample.label}
            </button>
          ))}
        </div>

        <div className="isin-tool__actions">
          <button
            type="button"
            className="btn btn--copy"
            onClick={handleCopy}
            disabled={isInputEmpty}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          {copied && (
            <div className="sr-only" role="status" aria-live="polite">
              Copied to clipboard
            </div>
          )}
          <button
            type="button"
            className="btn"
            onClick={handleClear}
            disabled={isInputEmpty}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="isin-tool__panel">
        <div className="isin-tool__label-row">
          <label className="isin-tool__label" htmlFor="isin-input">
            International Securities Identification Number (ISIN)
          </label>
        </div>
        <input
          id="isin-input"
          type="text"
          className="isin-tool__input"
          placeholder="e.g. US0378331005"
          value={input}
          onChange={handleInputChange}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!isInputEmpty && !result.isValid}
          aria-describedby={
            alertMessage ? 'isin-alert' : isInputEmpty ? 'isin-info' : undefined
          }
        />
      </div>

      {isInputEmpty && (
        <div id="isin-info" className="isin-tool__info">
          Enter a 12-character International Securities Identification Number (ISO 6166)
          to validate its structure (2-letter country code + 9-character NSIN + 1 check digit)
          and verify its Luhn mod-10 checksum.
        </div>
      )}

      {alertMessage && (
        <div id="isin-alert" className="isin-tool__alert isin-tool__alert--error" role="alert">
          <span>⚠</span>
          <span>{alertMessage}</span>
        </div>
      )}

      {result.isValid && (
        <div
          className="isin-tool__alert isin-tool__alert--success"
          role="status"
          aria-live="polite"
        >
          <span>✓</span>
          <span>Valid ISIN — passed ISO 6166 structural check and Luhn mod-10 checksum.</span>
        </div>
      )}

      {(result.isValid || result.countryCode) && (
        <div className="isin-tool__details">
          <h3 className="isin-tool__details-heading">Identifier Breakdown</h3>
          <div className="isin-tool__grid">
            <div className="isin-tool__card">
              <span className="isin-tool__card-title">Country Code</span>
              <span className="isin-tool__card-value">{result.countryCode ?? '—'}</span>
              <span className="isin-tool__card-subtext">ISO 3166-1 alpha-2</span>
            </div>

            <div className="isin-tool__card">
              <span className="isin-tool__card-title">National Identifier (NSIN)</span>
              <span className="isin-tool__card-value">{result.nsin ?? '—'}</span>
              <span className="isin-tool__card-subtext">9 alphanumeric characters</span>
            </div>

            <div className="isin-tool__card">
              <span className="isin-tool__card-title">Check Digit</span>
              <span className="isin-tool__card-value">
                {result.checkDigit !== null ? result.checkDigit : '—'}
              </span>
              <span className="isin-tool__card-subtext">
                {result.expectedCheckDigit !== null
                  ? `Expected: ${result.expectedCheckDigit}`
                  : 'Luhn mod-10 check digit'}
              </span>
            </div>

            {result.digits && (
              <div className="isin-tool__card">
                <span className="isin-tool__card-title">Luhn Converted Digits</span>
                <span className="isin-tool__card-value">{result.digits}</span>
                <span className="isin-tool__card-subtext">Letters converted to 10..35</span>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
