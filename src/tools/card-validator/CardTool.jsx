import { useMemo, useState } from 'react';
import { computeCheckDigit, validateCard } from './card.utils.js';
import './card.css';

// Publicly documented issuer test numbers only (never a real account number).
const SAMPLES = [
  { label: 'Visa', number: '4111 1111 1111 1111' },
  { label: 'Mastercard', number: '5500 0055 5555 5559' },
  { label: 'American Express', number: '3400 000000 00009' },
  { label: 'Discover', number: '6011 0000 0000 0004' },
  { label: 'JCB', number: '3530 1113 3330 0000' },
];

/**
 * Renders an offline card-number format and Luhn checksum validator with a check-digit
 * constructor for building test fixtures.
 * @returns {React.JSX.Element} The card validator tool.
 */
export default function CardTool() {
  const [cardInput, setCardInput] = useState('');
  const [partialInput, setPartialInput] = useState('');
  const [computed, setComputed] = useState(null);
  const [status, setStatus] = useState('');
  const validation = useMemo(() => validateCard(cardInput), [cardInput]);
  const validationError = cardInput ? validation.error : '';
  const computeError = computed?.error ?? '';

  async function copyValue(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} copied to clipboard.`);
    } catch {
      setStatus('Clipboard access was unavailable.');
    }
  }

  function clearValidation() {
    setCardInput('');
    setStatus('');
  }

  function clearComputation() {
    setPartialInput('');
    setComputed(null);
    setStatus('');
  }

  function calculateCheckDigit() {
    setComputed(computeCheckDigit(partialInput));
    setStatus('');
  }

  return (
    <section className="card-validator" aria-label="Card validator">
      <header className="card-validator__intro">
        <p className="card-validator__eyebrow">ISO/IEC 7812-1</p>
        <h2>Card Validator</h2>
        <p>
          Validate card number format and Luhn checksums locally in your browser. This is an
          offline format/checksum tool for test-fixture and input-sanity use — it is not a
          payment-processing or account-verification service, and no data ever leaves your
          browser.
        </p>
      </header>

      <section className="card-validator__panel" aria-labelledby="card-validate-heading">
        <div className="card-validator__heading">
          <div>
            <h3 id="card-validate-heading">Validate a card number</h3>
            <p>Spaces and hyphens are optional and are removed before offline validation.</p>
          </div>
          <div className="card-validator__samples" aria-label="Card number samples">
            {SAMPLES.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => setCardInput(sample.number)}
              >
                Load {sample.label} sample
              </button>
            ))}
          </div>
        </div>
        <label className="card-validator__field" htmlFor="card-input">
          Card number
          <input
            id="card-input"
            value={cardInput}
            onChange={(event) => setCardInput(event.target.value)}
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? 'card-validation-error' : undefined}
            placeholder="4111 1111 1111 1111"
            inputMode="numeric"
            spellCheck={false}
          />
        </label>
        <div className="card-validator__actions">
          <button type="button" onClick={clearValidation}>Clear card number</button>
          {validation.isValid && (
            <button
              type="button"
              onClick={() => copyValue(validation.digits, 'Validated card number')}
            >
              Copy validated number
            </button>
          )}
        </div>
        {validationError && (
          <p id="card-validation-error" className="card-validator__error" role="alert">
            {validationError}
          </p>
        )}
        {validation.isValid && (
          <article className="card-validator__result" aria-label="Validated card details">
            <span>Formatted number</span>
            <code>{validation.formattedNumber}</code>
            <dl>
              <div><dt>Network</dt><dd>{validation.network ?? 'Unknown'}</dd></div>
              <div><dt>Digit count</dt><dd>{validation.digitCount}</dd></div>
              <div><dt>Last four</dt><dd>{validation.lastFour}</dd></div>
            </dl>
          </article>
        )}
      </section>

      <section className="card-validator__panel" aria-labelledby="card-compute-heading">
        <div className="card-validator__heading">
          <div>
            <h3 id="card-compute-heading">Calculate a check digit</h3>
            <p>
              Enter a card number with the final digit omitted to compute the Luhn check digit
              needed to construct a valid test fixture.
            </p>
          </div>
        </div>
        <label className="card-validator__field" htmlFor="card-partial-input">
          Partial number (final digit omitted)
          <input
            id="card-partial-input"
            value={partialInput}
            onChange={(event) => setPartialInput(event.target.value)}
            aria-invalid={Boolean(computeError)}
            aria-describedby={computeError ? 'card-compute-error' : undefined}
            placeholder="4111 1111 1111 111"
            inputMode="numeric"
            spellCheck={false}
          />
        </label>
        <div className="card-validator__actions">
          <button type="button" onClick={calculateCheckDigit}>Calculate check digit</button>
          <button type="button" onClick={clearComputation}>Clear computation</button>
          {computed?.isValid && (
            <button
              type="button"
              onClick={() => copyValue(computed.fullNumber, 'Constructed card number')}
            >
              Copy constructed number
            </button>
          )}
        </div>
        {computeError && (
          <p id="card-compute-error" className="card-validator__error" role="alert">
            {computeError}
          </p>
        )}
        {computed?.isValid && (
          <article className="card-validator__result" aria-label="Constructed card details">
            <span>Check digit</span>
            <strong>{computed.checkDigit}</strong>
            <span>Constructed number</span>
            <code>{computed.formattedNumber}</code>
          </article>
        )}
      </section>

      <p className="card-validator__status" role="status" aria-live="polite">{status}</p>
      <p className="card-validator__privacy">
        Offline format and checksum validation only; no data leaves your browser.
      </p>
    </section>
  );
}
