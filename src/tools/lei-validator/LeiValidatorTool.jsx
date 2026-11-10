import { useMemo, useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import { validateLei } from './lei.utils.js';
import './lei.css';

const SAMPLES = [
  { label: 'Valid: Deutsche Bank', value: '529900T8BM49AURSDO55' },
  { label: 'Invalid checksum', value: '529900T8BM49AURSDO56' },
  { label: 'Invalid characters', value: '529900T8BM49AURSDO5!' },
];

/**
 * Renders a client-side validator for ISO 17442 Legal Entity Identifiers.
 *
 * @returns {React.JSX.Element} The LEI validator UI.
 */
export default function LeiValidatorTool() {
  const [input, setInput] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied, dismissCopyFeedback] = useCopyFeedback({
    initialValue: false,
    resetValue: false,
  });
  const result = useMemo(() => (input ? validateLei(input) : null), [input]);

  function resetCopyFeedback() {
    dismissCopyFeedback();
    setCopyError('');
  }

  function handleInputChange(event) {
    resetCopyFeedback();
    setInput(event.target.value.toUpperCase());
  }

  function handleClear() {
    resetCopyFeedback();
    setInput('');
  }

  function handleSampleLoad(value) {
    resetCopyFeedback();
    setInput(value);
  }

  async function handleCopy() {
    if (!input) return;

    try {
      await navigator.clipboard.writeText(input);
      setCopyError('');
      showCopied(true);
    } catch {
      dismissCopyFeedback();
      setCopyError('Failed to copy LEI to clipboard.');
    }
  }

  const message = copyError || (input && !result?.isValid ? result.error : '');

  return (
    <section className="lei-validator" aria-labelledby="lei-validator-title">
      <div className="lei-validator__intro">
        <p className="lei-validator__eyebrow">ISO 17442</p>
        <h2 id="lei-validator-title">LEI Validator</h2>
        <p>Check a 20-character Legal Entity Identifier using its MOD 97-10 check digits.</p>
      </div>

      <label className="lei-validator__label" htmlFor="lei-input">
        Legal Entity Identifier
      </label>
      <div className="lei-validator__input-row">
        <input
          id="lei-input"
          className="lei-validator__input"
          value={input}
          onChange={handleInputChange}
          placeholder="e.g. 529900T8BM49AURSDO55"
          aria-describedby="lei-help lei-message"
          spellCheck={false}
          autoCapitalize="characters"
        />
        <button
          type="button"
          className="lei-validator__button"
          onClick={handleCopy}
          disabled={!input}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
        <button
          type="button"
          className="lei-validator__button"
          onClick={handleClear}
          disabled={!input}
        >
          Clear
        </button>
      </div>
      <p id="lei-help" className="lei-validator__help">
        The first four characters identify the LOU; the last two are check digits.
      </p>

      {copied && (
        <div className="sr-only" role="status" aria-live="polite">
          LEI copied to clipboard
        </div>
      )}

      {input && result?.isValid && (
        <div className="lei-validator__valid" role="status">
          ✓ Valid LEI: format and MOD 97-10 check digits match.
        </div>
      )}
      {message && (
        <div id="lei-message" className="lei-validator__error" role="alert">
          ⚠ {message}
        </div>
      )}

      <div className="lei-validator__samples" aria-label="LEI samples">
        <span className="lei-validator__samples-label">Try a sample:</span>
        {SAMPLES.map((sample) => (
          <button
            type="button"
            className="lei-validator__sample"
            key={sample.label}
            onClick={() => handleSampleLoad(sample.value)}
          >
            {sample.label}
          </button>
        ))}
      </div>
    </section>
  );
}
