import { useMemo, useState } from 'react';
import { convertIsbn10To13, convertIsbn13To10, validateIsbn } from './isbn-validator.utils.js';
import './isbn-validator.css';

const SAMPLES = [
  { label: 'ISBN-10', isbn: '0-306-40615-2' },
  { label: 'ISBN-13', isbn: '979-10-90636-07-1' },
];

/**
 * Renders an offline ISBN-10 and ISBN-13 checksum validator with format conversion.
 * @returns {React.JSX.Element} The ISBN validation tool.
 */
export default function IsbnValidatorTool() {
  const [isbnInput, setIsbnInput] = useState('');
  const validation = useMemo(() => validateIsbn(isbnInput), [isbnInput]);
  const validationError = isbnInput ? validation.error : '';
  const conversion = useMemo(() => {
    if (!validation.isValid) return null;
    return validation.standard === 'ISBN-10'
      ? convertIsbn10To13(isbnInput)
      : convertIsbn13To10(isbnInput);
  }, [isbnInput, validation]);

  return (
    <section className="isbn-validator" aria-label="ISBN validator">
      <header className="isbn-validator__intro">
        <p className="isbn-validator__eyebrow">ISO 2108</p>
        <h2>ISBN Validator</h2>
        <p>
          Validate ISBN-10 and ISBN-13 identifiers and convert eligible editions locally in your
          browser. Nothing is sent over the network.
        </p>
      </header>
      <section className="isbn-validator__panel" aria-labelledby="isbn-validate-heading">
        <div className="isbn-validator__heading">
          <div>
            <h3 id="isbn-validate-heading">Validate and convert an ISBN</h3>
            <p>Spaces and hyphens are optional. ISBN-10 may use X as its final check digit.</p>
          </div>
          <div className="isbn-validator__samples" aria-label="ISBN samples">
            {SAMPLES.map((sample) => (
              <button key={sample.label} type="button" onClick={() => setIsbnInput(sample.isbn)}>
                Load {sample.label} sample
              </button>
            ))}
          </div>
        </div>
        <label className="isbn-validator__field" htmlFor="isbn-input">
          ISBN-10 or ISBN-13
          <input
            id="isbn-input"
            value={isbnInput}
            onChange={(event) => setIsbnInput(event.target.value)}
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? 'isbn-validation-error' : undefined}
            placeholder="978-0-306-40615-7"
            spellCheck={false}
          />
        </label>
        <div className="isbn-validator__actions">
          <button type="button" onClick={() => setIsbnInput('')}>Clear ISBN</button>
        </div>
        {validationError && (
          <p id="isbn-validation-error" className="isbn-validator__error" role="alert">
            {validationError}
          </p>
        )}
        {validation.isValid && (
          <article className="isbn-validator__result" aria-label="Validated ISBN details">
            <span>Validation result</span>
            <strong>Valid {validation.standard}</strong>
            <span>Normalized ISBN</span>
            <code>{validation.isbn}</code>
            {conversion?.isValid && (
              <>
                <span>Converted {conversion.standard}</span>
                <code>{conversion.convertedIsbn}</code>
              </>
            )}
          </article>
        )}
        {conversion?.error && (
          <p className="isbn-validator__error" role="alert">
            {conversion.error}
          </p>
        )}
      </section>
    </section>
  );
}
