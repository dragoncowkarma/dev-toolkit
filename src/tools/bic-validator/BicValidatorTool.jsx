import { useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import { parseBic } from './bic.utils.js';
import './bic.css';

const SAMPLES = [
  { label: 'Deutsche Bank (primary office)', value: 'DEUTDEFF' },
  { label: 'Deutsche Bank (branch 500)', value: 'DEUTDEFF500' },
  { label: 'Invalid example', value: 'DEUTZZFF' },
];

/**
 * Renders a client-side BIC/SWIFT format validator and field inspector.
 *
 * @returns {React.JSX.Element} The BIC validator interface.
 */
export default function BicValidatorTool() {
  const [input, setInput] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });
  const result = input ? parseBic(input) : null;
  const isInvalid = Boolean(result && !result.valid);

  function handleInputChange(event) {
    setInput(event.target.value);
    setCopyError('');
  }

  function handleSample(value) {
    setInput(value);
    setCopyError('');
  }

  async function handleCopy() {
    if (!result?.valid) return;

    try {
      await navigator.clipboard.writeText(result.value);
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy the BIC/SWIFT code to the clipboard.');
    }
  }

  return (
    <section className="bic-validator" aria-label="BIC and SWIFT code validator">
      <div className="bic-validator__intro">
        <h2>Validate a BIC / SWIFT code</h2>
        <p>Enter an 8- or 11-character ISO 9362 bank identifier code.</p>
      </div>

      <label className="bic-validator__label" htmlFor="bic-input">
        BIC / SWIFT code
      </label>
      <input
        id="bic-input"
        className="bic-validator__input"
        type="text"
        value={input}
        onChange={handleInputChange}
        placeholder="DEUTDEFF or DEUTDEFF500"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={isInvalid}
        aria-describedby={isInvalid ? 'bic-error' : undefined}
      />

      <div className="bic-validator__samples" aria-label="BIC example inputs">
        {SAMPLES.map((sample) => (
          <button
            key={sample.value}
            type="button"
            className="bic-validator__sample"
            onClick={() => handleSample(sample.value)}
          >
            {sample.label}: <code>{sample.value}</code>
          </button>
        ))}
      </div>

      {isInvalid && (
        <p id="bic-error" className="bic-validator__message bic-validator__message--error" role="alert">
          {result.error}
        </p>
      )}

      {result?.valid && (
        <div className="bic-validator__result">
          <div className="bic-validator__result-header">
            <p className="bic-validator__message bic-validator__message--success" role="status">
              Valid ISO 9362 BIC/SWIFT code
            </p>
            <button type="button" className="bic-validator__copy" onClick={handleCopy}>
              {copied ? 'Copied' : 'Copy code'}
            </button>
          </div>
          {copied && (
            <span className="sr-only" role="status" aria-live="polite">
              BIC/SWIFT code copied to clipboard
            </span>
          )}
          <dl className="bic-validator__fields">
            <div>
              <dt>Bank code</dt>
              <dd>{result.bankCode}</dd>
            </div>
            <div>
              <dt>Country code</dt>
              <dd>{result.countryCode}</dd>
            </div>
            <div>
              <dt>Location code</dt>
              <dd>{result.locationCode}</dd>
            </div>
            <div>
              <dt>Branch code</dt>
              <dd>{result.branchCode}</dd>
            </div>
          </dl>
        </div>
      )}

      {copyError && (
        <p className="bic-validator__message bic-validator__message--error" role="alert">
          {copyError}
        </p>
      )}
    </section>
  );
}
