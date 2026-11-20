import { useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import { validateCusip } from './cusip.utils.js';
import './cusip.css';

const ERROR_MESSAGES = {
  'wrong-length': 'CUSIP must be exactly 9 characters long.',
  'invalid-character':
    'Use uppercase letters, digits, and only *, @, or # in the first 8 characters.',
  'checksum-mismatch': 'The checksum digit does not match this CUSIP.',
};

/**
 * Renders a live, client-side CUSIP validator.
 * @returns {React.JSX.Element} The CUSIP validator UI.
 */
export default function CusipValidatorTool() {
  const [value, setValue] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });
  const validation = value === '' ? null : validateCusip(value);
  const errorMessage = validation?.error ? ERROR_MESSAGES[validation.error] : '';
  const errorId = 'cusip-validation-error';

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy CUSIP to clipboard.');
    }
  }

  function handleChange(event) {
    setValue(event.target.value);
    setCopyError('');
  }

  const alertMessage = errorMessage || copyError;
  const statusMessage = copied
    ? 'CUSIP copied to clipboard.'
    : validation?.isValid
      ? 'Valid CUSIP.'
      : '';

  return (
    <section className="cusip-validator-tool" aria-label="CUSIP Validator Tool">
      <div className="cusip-validator-card">
        <p className="cusip-validator-intro">
          Check a 9-character US or Canadian CUSIP identifier without sending it anywhere.
        </p>
        <label className="cusip-validator-label" htmlFor="cusip-input">
          CUSIP
        </label>
        <div className="cusip-validator-input-row">
          <input
            id="cusip-input"
            className="cusip-validator-input"
            type="text"
            value={value}
            onChange={handleChange}
            placeholder="e.g. 037833100"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={errorMessage ? errorId : undefined}
          />
          <button
            type="button"
            className="cusip-validator-copy"
            onClick={handleCopy}
            disabled={!validation?.isValid}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="cusip-validator-help">
          Letters must be uppercase. The final character is a digit.
        </p>
        {alertMessage && (
          <p id={errorId} className="cusip-validator-error" role="alert">
            {alertMessage}
          </p>
        )}
        {statusMessage && (
          <p className="sr-only" role="status" aria-live="polite">
            {statusMessage}
          </p>
        )}
      </div>
    </section>
  );
}
