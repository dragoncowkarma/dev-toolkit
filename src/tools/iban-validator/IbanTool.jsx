import { useMemo, useState } from 'react';
import { constructIban, validateIban } from './iban.utils.js';
import './iban.css';

const SAMPLES = [
  { label: 'Germany', iban: 'DE89 3704 0044 0532 0130 00' },
  { label: 'United Kingdom', iban: 'GB29 NWBK 6016 1331 9268 19' },
  { label: 'France', iban: 'FR14 2004 1010 0505 0001 3M02 606' },
];

/**
 * Renders an offline IBAN format and checksum validator with a check-digit constructor.
 * @returns {React.JSX.Element} The IBAN validation tool.
 */
export default function IbanTool() {
  const [ibanInput, setIbanInput] = useState('');
  const [countryInput, setCountryInput] = useState('');
  const [bbanInput, setBbanInput] = useState('');
  const [constructed, setConstructed] = useState(null);
  const [status, setStatus] = useState('');
  const validation = useMemo(() => validateIban(ibanInput), [ibanInput]);
  const validationError = ibanInput ? validation.error : '';
  const constructError = constructed?.error ?? '';

  async function copyValue(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} copied to clipboard.`);
    } catch {
      setStatus('Clipboard access was unavailable.');
    }
  }

  function clearValidation() {
    setIbanInput('');
    setStatus('');
  }

  function clearConstruction() {
    setCountryInput('');
    setBbanInput('');
    setConstructed(null);
    setStatus('');
  }

  function calculateCheckDigits() {
    setConstructed(constructIban(countryInput, bbanInput));
    setStatus('');
  }

  return (
    <section className="iban" aria-label="IBAN validator">
      <header className="iban__intro">
        <p className="iban__eyebrow">ISO 13616</p>
        <h2>IBAN Validator</h2>
        <p>Validate IBAN structure and MOD-97 checksums locally in your browser.</p>
      </header>

      <section className="iban__panel" aria-labelledby="iban-validate-heading">
        <div className="iban__heading">
          <div>
            <h3 id="iban-validate-heading">Validate an IBAN</h3>
            <p>Spaces are optional and are removed before offline validation.</p>
          </div>
          <div className="iban__samples" aria-label="IBAN samples">
            {SAMPLES.map((sample) => (
              <button key={sample.label} type="button" onClick={() => setIbanInput(sample.iban)}>
                Load {sample.label} sample
              </button>
            ))}
          </div>
        </div>
        <label className="iban__field" htmlFor="iban-input">
          IBAN
          <input
            id="iban-input"
            value={ibanInput}
            onChange={(event) => setIbanInput(event.target.value)}
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? 'iban-validation-error' : undefined}
            placeholder="DE89 3704 0044 0532 0130 00"
            spellCheck={false}
          />
        </label>
        <div className="iban__actions">
          <button type="button" onClick={clearValidation}>Clear IBAN</button>
          {validation.isValid && (
            <button type="button" onClick={() => copyValue(validation.iban, 'Validated IBAN')}>
              Copy validated IBAN
            </button>
          )}
        </div>
        {validationError && (
          <p id="iban-validation-error" className="iban__error" role="alert">
            {validationError}
          </p>
        )}
        {validation.isValid && (
          <article className="iban__result" aria-label="Validated IBAN details">
            <span>Formatted IBAN</span>
            <code>{validation.formattedIban}</code>
            <dl>
              <div><dt>Country</dt><dd>{validation.countryCode}</dd></div>
              <div><dt>Check digits</dt><dd>{validation.checkDigits}</dd></div>
              <div><dt>BBAN</dt><dd>{validation.bban}</dd></div>
            </dl>
          </article>
        )}
      </section>

      <section className="iban__panel" aria-labelledby="iban-construct-heading">
        <div className="iban__heading">
          <div>
            <h3 id="iban-construct-heading">Calculate check digits</h3>
            <p>Construct an IBAN from its country code and BBAN without sending account data.</p>
          </div>
        </div>
        <div className="iban__field-grid">
          <label className="iban__field" htmlFor="iban-country">
            Country code
            <input
              id="iban-country"
              value={countryInput}
              onChange={(event) => setCountryInput(event.target.value)}
              aria-invalid={Boolean(constructError)}
              aria-describedby={constructError ? 'iban-construction-error' : undefined}
              placeholder="DE"
              maxLength="2"
              spellCheck={false}
            />
          </label>
          <label className="iban__field" htmlFor="iban-bban">
            BBAN
            <input
              id="iban-bban"
              value={bbanInput}
              onChange={(event) => setBbanInput(event.target.value)}
              aria-invalid={Boolean(constructError)}
              aria-describedby={constructError ? 'iban-construction-error' : undefined}
              placeholder="370400440532013000"
              spellCheck={false}
            />
          </label>
        </div>
        <div className="iban__actions">
          <button type="button" onClick={calculateCheckDigits}>Calculate check digits</button>
          <button type="button" onClick={clearConstruction}>Clear construction</button>
          {constructed?.isValid && (
            <button type="button" onClick={() => copyValue(constructed.iban, 'Constructed IBAN')}>
              Copy constructed IBAN
            </button>
          )}
        </div>
        {constructError && (
          <p id="iban-construction-error" className="iban__error" role="alert">
            {constructError}
          </p>
        )}
        {constructed?.isValid && (
          <article className="iban__result" aria-label="Constructed IBAN details">
            <span>Check digits</span>
            <strong>{constructed.checkDigits}</strong>
            <span>Constructed IBAN</span>
            <code>{constructed.formattedIban}</code>
          </article>
        )}
      </section>

      <p className="iban__status" role="status" aria-live="polite">{status}</p>
      <p className="iban__privacy">
        Offline format and checksum validation only; no data leaves your browser.
      </p>
    </section>
  );
}
