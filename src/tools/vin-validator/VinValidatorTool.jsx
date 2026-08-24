import { useMemo, useState } from 'react';
import { validateVin } from './vin-validator.utils.js';
import './vin-validator.css';

const SAMPLES = [
  { label: 'USA (Honda 2017)', vin: '1HG CR2F8 5 HA000000' },
  { label: 'USA (Ford 2017 - X check)', vin: '1FA6P8CFXH5123457' },
  { label: 'Europe (VW Germany)', vin: 'WVW-ZZZ-3CZWE-000000' },
];

/**
 * Renders an offline ISO 3779 VIN validator and model-year / region decoder tool.
 * @returns {React.JSX.Element} The VIN validation tool component.
 */
export default function VinValidatorTool() {
  const [vinInput, setVinInput] = useState('');
  const [status, setStatus] = useState('');

  const validation = useMemo(() => validateVin(vinInput), [vinInput]);
  const validationError = vinInput ? validation.error : '';

  async function handleCopy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`${label} copied to clipboard.`);
    } catch {
      setStatus('Clipboard access was unavailable.');
    }
  }

  function handleClear() {
    setVinInput('');
    setStatus('');
  }

  return (
    <section className="vin-validator" aria-label="VIN validator">
      <header className="vin-validator__intro">
        <p className="vin-validator__eyebrow">ISO 3779 / NHTSA SAE J853</p>
        <h2>VIN Validator & Decoder</h2>
        <p>
          Validate 17-character Vehicle Identification Numbers (VIN), compute NHTSA check digits,
          and decode manufacturer region and candidate model years offline in your browser.
        </p>
      </header>

      <section className="vin-validator__panel" aria-labelledby="vin-validate-heading">
        <div className="vin-validator__heading">
          <div>
            <h3 id="vin-validate-heading">Validate and decode a VIN</h3>
            <p>
              Spaces and hyphens are automatically normalized. Letters I, O, and Q are forbidden.
            </p>
          </div>
          <div className="vin-validator__samples" aria-label="Sample VINs">
            {SAMPLES.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => {
                  setVinInput(sample.vin);
                  setStatus('');
                }}
              >
                Load {sample.label}
              </button>
            ))}
          </div>
        </div>

        <label className="vin-validator__field" htmlFor="vin-input">
          Vehicle Identification Number (17 characters)
          <input
            id="vin-input"
            value={vinInput}
            onChange={(event) => {
              setVinInput(event.target.value);
              setStatus('');
            }}
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? 'vin-validation-error' : undefined}
            placeholder="1HGCR2F85HA000000"
            maxLength="24"
            spellCheck={false}
          />
        </label>

        <div className="vin-validator__actions">
          <button type="button" onClick={handleClear}>
            Clear VIN
          </button>
          {validation.isFormatValid && (
            <button
              type="button"
              onClick={() => handleCopy(validation.normalized, 'Normalized VIN')}
            >
              Copy normalized VIN
            </button>
          )}
        </div>

        {validationError && (
          <p id="vin-validation-error" className="vin-validator__error" role="alert">
            {validationError}
          </p>
        )}

        {validation.isFormatValid && validation.decoded && (
          <article className="vin-validator__result" aria-label="Validated VIN details">
            <span className="vin-validator__result-label">Validation Status</span>

            {validation.isNorthAmerican ? (
              <div
                className={`vin-validator__badge ${
                  validation.isCheckDigitValid
                    ? 'vin-validator__badge--valid'
                    : 'vin-validator__badge--invalid'
                }`}
              >
                {validation.isCheckDigitValid
                  ? '✓ Valid North American VIN (Check Digit Match)'
                  : '✕ Invalid Check Digit'}
              </div>
            ) : (
              <div
                className={`vin-validator__badge ${
                  validation.isCheckDigitValid
                    ? 'vin-validator__badge--valid'
                    : 'vin-validator__badge--info'
                }`}
              >
                {validation.isCheckDigitValid
                  ? '✓ Valid ISO 3779 VIN (NHTSA Check Match)'
                  : 'ℹ Valid ISO 3779 VIN Structure (Non-North American)'}
              </div>
            )}

            {validation.checkDigitInfo && (
              <p className="vin-validator__note">{validation.checkDigitInfo.note}</p>
            )}

            <div className="vin-validator__grid" aria-label="VIN breakdown details">
              <div className="vin-validator__grid-item">
                <span className="vin-validator__grid-label">Normalized VIN</span>
                <span className="vin-validator__grid-value">{validation.normalized}</span>
              </div>

              <div className="vin-validator__grid-item">
                <span className="vin-validator__grid-label">WMI Region & Country</span>
                <span className="vin-validator__grid-value">
                  {validation.decoded.wmiInfo.region} ({validation.decoded.wmiInfo.country})
                  {validation.decoded.wmiInfo.manufacturer
                    ? ` — ${validation.decoded.wmiInfo.manufacturer}`
                    : ''}
                </span>
              </div>

              <div className="vin-validator__grid-item">
                <span className="vin-validator__grid-label">Model Year (Pos 10)</span>
                <span className="vin-validator__grid-value">
                  {validation.decoded.candidateModelYears
                    ? `Code '${validation.decoded.modelYearCode}': ${
                      validation.decoded.candidateModelYears.join(' or ')
                    }`
                    : `Code '${validation.decoded.modelYearCode}' (Unknown)`}
                </span>
              </div>

              <div className="vin-validator__grid-item vin-validator__grid-item--wide">
                <span className="vin-validator__grid-label">
                  Model Year Resolution (Pos 7 Heuristic)
                </span>
                {validation.decoded.modelYearResolution?.resolvedModelYear ? (
                  <div
                    className="vin-validator__badge vin-validator__badge--valid"
                    aria-label="Resolved model year"
                  >
                    ✓ Resolved: {validation.decoded.modelYearResolution.resolvedModelYear}
                  </div>
                ) : (
                  <div
                    className="vin-validator__badge vin-validator__badge--info"
                    aria-label="Ambiguous model year"
                  >
                    ℹ Ambiguous — both candidates remain possible
                  </div>
                )}
                <span className="vin-validator__grid-value vin-validator__grid-value--muted">
                  {validation.decoded.modelYearResolution?.explanation}
                </span>
              </div>

              <div className="vin-validator__grid-item">
                <span className="vin-validator__grid-label">Check Digit (Pos 9)</span>
                <span className="vin-validator__grid-value">
                  Actual: &apos;{validation.checkDigitInfo?.actual}&apos; | Expected:{' '}
                  &apos;{validation.checkDigitInfo?.expected}&apos;
                </span>
              </div>

              <div className="vin-validator__grid-item">
                <span className="vin-validator__grid-label">VDS (Pos 4-8)</span>
                <span className="vin-validator__grid-value">{validation.decoded.vds}</span>
              </div>

              <div className="vin-validator__grid-item">
                <span className="vin-validator__grid-label">VIS / Serial (Pos 11-17)</span>
                <span className="vin-validator__grid-value">
                  Plant: {validation.decoded.plantCode} | Seq: {validation.decoded.vis}
                </span>
              </div>
            </div>
          </article>
        )}
      </section>

      {status && (
        <p className="vin-validator__status" role="status" aria-live="polite">
          {status}
        </p>
      )}

      <p className="vin-validator__privacy">
        Offline validation and decoding only; no vehicle data is sent over the network.
      </p>
    </section>
  );
}
