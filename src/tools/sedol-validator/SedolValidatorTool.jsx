import { useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import { validateSedol } from './sedol.utils.js';
import './sedol.css';

/**
 * Renders a live validator for UK and Irish SEDOL identifiers.
 *
 * @returns {React.JSX.Element} The SEDOL validator interface.
 */
export default function SedolValidatorTool() {
  const [value, setValue] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });
  const validation = value === '' ? null : validateSedol(value);
  const errorMessage = copyError || (!validation?.isValid ? validation?.errorMessage : '');
  const statusMessage = copied
    ? 'SEDOL copied to clipboard.'
    : validation?.isValid
      ? 'Valid SEDOL.'
      : '';

  function handleChange(event) {
    setValue(event.target.value);
    setCopyError('');
  }

  async function handleCopy() {
    if (!validation?.isValid) return;
    try {
      await navigator.clipboard.writeText(value);
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  function handleClear() {
    setValue('');
    setCopyError('');
  }

  return (
    <section className="sedol-validator" aria-label="SEDOL Validator Tool">
      <div className="sedol-validator__intro">
        <h2>SEDOL Validator</h2>
        <p>Check a seven-character UK or Irish security identifier and its checksum.</p>
      </div>

      <div className="sedol-validator__field">
        <label htmlFor="sedol-input">SEDOL</label>
        <input
          id="sedol-input"
          className="sedol-validator__input"
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="e.g. 0263494"
          maxLength="7"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={validation ? !validation.isValid : undefined}
          aria-describedby={errorMessage ? 'sedol-error' : undefined}
        />
        <p className="sedol-validator__hint">
          Six digits or uppercase consonants, plus one checksum digit.
        </p>
      </div>

      <div className="sedol-validator__actions">
        <button
          type="button"
          className="sedol-validator__button"
          onClick={handleCopy}
          disabled={!validation?.isValid}
        >
          Copy SEDOL
        </button>
        <button
          type="button"
          className="sedol-validator__button"
          onClick={handleClear}
          disabled={!value}
        >
          Clear
        </button>
      </div>

      {errorMessage && (
        <p
          id="sedol-error"
          className="sedol-validator__message sedol-validator__message--error"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
      {statusMessage && (
        <p
          className="sedol-validator__message sedol-validator__message--valid"
          role="status"
          aria-live="polite"
        >
          {statusMessage}
        </p>
      )}
    </section>
  );
}
