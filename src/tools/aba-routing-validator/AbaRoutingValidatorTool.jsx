import { useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import { validateAbaRoutingNumber } from './aba.utils.js';
import './aba.css';

/**
 * Renders a client-side US ABA routing number validator.
 *
 * @returns {React.JSX.Element} The ABA routing validator UI.
 */
export default function AbaRoutingValidatorTool() {
  const [routingNumber, setRoutingNumber] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });
  const validation = routingNumber
    ? validateAbaRoutingNumber(routingNumber)
    : { valid: false, error: '' };
  const feedbackId = validation.error ? 'aba-routing-feedback' : undefined;

  function handleRoutingNumberChange(event) {
    setRoutingNumber(event.target.value);
    setCopyError('');
  }

  async function handleCopy() {
    if (!validation.valid) return;

    try {
      await navigator.clipboard.writeText(routingNumber);
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy the routing number to the clipboard.');
    }
  }

  return (
    <section className="aba-routing-validator" aria-label="ABA Routing Number Validator">
      <div className="aba-routing-validator__card">
        <label className="aba-routing-validator__label" htmlFor="aba-routing-number">
          ABA routing number
        </label>
        <p className="aba-routing-validator__help" id="aba-routing-help">
          Enter the 9-digit routing transit number from a US check or bank account.
        </p>
        <div className="aba-routing-validator__controls">
          <input
            id="aba-routing-number"
            className="aba-routing-validator__input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 021000021"
            value={routingNumber}
            onChange={handleRoutingNumberChange}
            aria-invalid={routingNumber ? !validation.valid : undefined}
            aria-describedby={feedbackId}
          />
          <button
            type="button"
            className="aba-routing-validator__copy-button"
            onClick={handleCopy}
            disabled={!validation.valid}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        {validation.error && (
          <p className="aba-routing-validator__error" id="aba-routing-feedback" role="alert">
            {validation.error}
          </p>
        )}
        {validation.valid && (
          <p className="aba-routing-validator__success" role="status" aria-live="polite">
            This is a valid ABA routing number.
          </p>
        )}
        {copied && (
          <p className="sr-only" role="status" aria-live="polite">
            Routing number copied to clipboard.
          </p>
        )}
        {copyError && (
          <p className="aba-routing-validator__error" role="alert">
            {copyError}
          </p>
        )}
      </div>
    </section>
  );
}
