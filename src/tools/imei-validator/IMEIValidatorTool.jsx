import { useMemo, useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import {
  IDENTIFIER_TYPES,
  detectIdentifierType,
  normalizeIdentifier,
  parseIdentifier,
} from './imeiValidator.utils.js';
import './imeiValidator.css';

/**
 * Renders a local IMEI and IMEISV validator with device identifier decoding.
 *
 * @returns {React.JSX.Element} The IMEI validator UI.
 */
export default function IMEIValidatorTool() {
  const [input, setInput] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });
  const parsed = useMemo(() => parseIdentifier(input), [input]);
  const normalized = normalizeIdentifier(input);
  const type = detectIdentifierType(input);
  const invalidCheckDigit = type === IDENTIFIER_TYPES.IMEI && parsed && !parsed.isValid;
  const error = getValidationError(input, normalized, type, invalidCheckDigit);

  async function handleCopy() {
    const value = parsed?.fullImei ?? parsed?.normalized;
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
  const hasDecodedIdentifier = parsed && parsed.isValid;
  const copyValue = parsed?.fullImei ?? parsed?.normalized;

  return (
    <section className="imei-validator" aria-label="IMEI and IMEISV Validator Tool">
      <div className="imei-validator__intro">
        <h2>IMEI / IMEISV Validator</h2>
        <p>Validate and decode device identifiers locally in your browser.</p>
      </div>

      <label className="imei-validator__label" htmlFor="imei-input">
        IMEI or IMEISV
      </label>
      <input
        id="imei-input"
        className="imei-validator__input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="e.g. 49015420-323751-8"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        aria-describedby="imei-help"
        aria-invalid={Boolean(error)}
      />
      <p id="imei-help" className="imei-validator__help">
        Enter 14 or 15 IMEI digits, or a 16-digit IMEISV. Spaces and hyphens are allowed.
      </p>

      {alertMessage && (
        <div className="imei-validator__error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}

      {hasDecodedIdentifier && (
        <div className="imei-validator__result">
          <div className="imei-validator__result-header">
            <div>
              <h3>{getResultTitle(parsed.type)}</h3>
              <p>{getResultDescription(parsed)}</p>
            </div>
            <button type="button" className="imei-validator__copy" onClick={handleCopy}>
              {copied ? '✓ Copied' : `Copy ${parsed.fullImei ? 'IMEI' : 'IMEISV'}`}
            </button>
            {copied && (
              <span className="sr-only" role="status" aria-live="polite">
                {copyValue} copied to clipboard
              </span>
            )}
          </div>
          <dl className="imei-validator__details">
            <div>
              <dt>TAC</dt>
              <dd>{parsed.tac}</dd>
              <small>Type Allocation Code</small>
            </div>
            <div>
              <dt>Serial Number</dt>
              <dd>{parsed.snr}</dd>
              <small>Digits 9–14</small>
            </div>
            {parsed.checkDigit && (
              <div>
                <dt>Check Digit</dt>
                <dd>{parsed.checkDigit}</dd>
                <small>Luhn verified</small>
              </div>
            )}
            {parsed.svn && (
              <div>
                <dt>Software Version Number</dt>
                <dd>{parsed.svn}</dd>
                <small>SVN (digits 15–16)</small>
              </div>
            )}
          </dl>
          {parsed.fullImei && (
            <p className="imei-validator__full-imei">
              Full valid IMEI: <code>{parsed.fullImei}</code>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function getValidationError(input, normalized, type, invalidCheckDigit) {
  if (!input) return '';
  if (!/^\d+$/.test(normalized)) {
    return 'Use digits, spaces, and hyphens only.';
  }
  if (type === IDENTIFIER_TYPES.INVALID) {
    return 'Enter a 14-digit IMEI, 15-digit IMEI, or 16-digit IMEISV.';
  }
  if (invalidCheckDigit) {
    return 'The IMEI check digit is invalid. Please check the final digit.';
  }
  return '';
}

function getResultTitle(type) {
  if (type === IDENTIFIER_TYPES.IMEISV) return 'Valid IMEISV';
  if (type === IDENTIFIER_TYPES.IMEI_WITHOUT_CHECK_DIGIT) return 'IMEI check digit calculated';
  return 'Valid IMEI';
}

function getResultDescription(parsed) {
  if (parsed.type === IDENTIFIER_TYPES.IMEISV) {
    return 'This IMEISV does not include an IMEI Luhn check digit.';
  }
  if (parsed.type === IDENTIFIER_TYPES.IMEI_WITHOUT_CHECK_DIGIT) {
    return 'The missing Luhn check digit has been calculated below.';
  }
  return 'The IMEI check digit passes Luhn validation.';
}
