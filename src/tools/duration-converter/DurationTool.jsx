import { useMemo, useState } from 'react';
import {
  durationToMilliseconds,
  durationToSeconds,
  formatClock,
  formatDuration,
  formatDurationFromSeconds,
  formatHumanBreakdown,
  parseDuration,
} from './duration.utils.js';
import './duration.css';

const EMPTY_COMPONENTS = {
  years: '', months: '', weeks: '', days: '', hours: '', minutes: '', seconds: '',
};
const COMPONENT_LABELS = {
  years: 'Years', months: 'Months', weeks: 'Weeks', days: 'Days', hours: 'Hours',
  minutes: 'Minutes', seconds: 'Seconds',
};

function outputRows(result) {
  if (!result.isValid || !result.components) return [];
  const totalSeconds = durationToSeconds(result.components);
  return [
    ['Canonical ISO 8601', result.canonical],
    ['Total seconds', String(totalSeconds)],
    ['Total milliseconds', String(durationToMilliseconds(result.components))],
    ['Human-readable breakdown', formatHumanBreakdown(result.components)],
    ['Clock form', formatClock(totalSeconds)],
  ];
}

/**
 * Renders ISO 8601 duration parsing and reverse duration conversion entirely in the browser.
 *
 * @returns {React.JSX.Element} The Duration Converter tool.
 */
export default function DurationTool() {
  const [durationInput, setDurationInput] = useState('');
  const [secondsInput, setSecondsInput] = useState('');
  const [componentValues, setComponentValues] = useState(EMPTY_COMPONENTS);
  const [componentSign, setComponentSign] = useState('1');
  const [actionError, setActionError] = useState('');
  const [invalidField, setInvalidField] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const result = useMemo(() => parseDuration(durationInput), [durationInput]);
  const rows = outputRows(result);
  const parseError = durationInput && !result.isValid ? result.error : '';
  const error = actionError || parseError;

  function setDuration(value) {
    setDurationInput(value);
    setActionError('');
    setInvalidField('');
  }

  function handleClear() {
    setDurationInput('');
    setSecondsInput('');
    setComponentValues(EMPTY_COMPONENTS);
    setActionError('');
    setInvalidField('');
    setCopyStatus('');
  }

  function handleSample() {
    setDuration('P3DT4H5M6S');
  }

  function handleSecondsSubmit(event) {
    event.preventDefault();
    const totalSeconds = Number(secondsInput);
    if (!secondsInput.trim() || !Number.isFinite(totalSeconds)) {
      setActionError('Enter a finite numeric total in seconds.');
      setInvalidField('duration-seconds');
      return;
    }
    setDuration(formatDurationFromSeconds(totalSeconds));
  }

  function handleComponentsSubmit(event) {
    event.preventDefault();
    const numericComponents = Object.fromEntries(
      Object.entries(componentValues).map(([key, value]) => (
        [key, value === '' ? 0 : Number(value)]
      )),
    );
    try {
      setDuration(formatDuration({ sign: Number(componentSign), ...numericComponents }));
    } catch (conversionError) {
      setActionError(conversionError.message);
      setInvalidField('duration-components');
    }
  }

  async function handleCopy(label, value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label} copied to clipboard.`);
    } catch {
      setActionError('Failed to copy to clipboard.');
    }
  }

  return (
    <section className="duration-tool" aria-label="Duration Converter Tool">
      <header className="duration-tool__intro">
        <p className="duration-tool__eyebrow">ISO 8601 INTERVALS</p>
        <h2>Duration Converter</h2>
        <p>Parse durations locally in your browser, with no input sent anywhere.</p>
      </header>

      <div className="duration-tool__panel">
        <div className="duration-tool__heading-row">
          <label htmlFor="duration-input">ISO 8601 duration</label>
          <div className="duration-tool__actions">
            <button type="button" onClick={handleSample}>Load sample</button>
            <button type="button" onClick={handleClear}>Clear</button>
          </div>
        </div>
        <input
          id="duration-input"
          value={durationInput}
          onChange={(event) => setDuration(event.target.value)}
          placeholder="e.g. P3DT4H5M6S or -PT1H"
          spellCheck={false}
          aria-invalid={invalidField === 'duration-input' || Boolean(parseError) || undefined}
          aria-describedby={error ? 'duration-error' : undefined}
        />
        <p className="duration-tool__hint">M before T means months; M after T means minutes.</p>
      </div>

      <div className="duration-tool__reverse-grid">
        <form className="duration-tool__panel" onSubmit={handleSecondsSubmit}>
          <label htmlFor="duration-seconds">Convert total seconds</label>
          <div className="duration-tool__inline-input">
            <input
              id="duration-seconds"
              value={secondsInput}
              onChange={(event) => setSecondsInput(event.target.value)}
              inputMode="decimal"
              placeholder="e.g. 5400"
              aria-invalid={invalidField === 'duration-seconds' || undefined}
              aria-describedby={error ? 'duration-error' : undefined}
            />
            <button type="submit">Build ISO</button>
          </div>
        </form>

        <form className="duration-tool__panel" onSubmit={handleComponentsSubmit}>
          <fieldset aria-describedby={error ? 'duration-error' : undefined}>
            <legend>Build from components</legend>
            <label className="duration-tool__sign" htmlFor="duration-sign">
              Sign
              <select
                id="duration-sign"
                value={componentSign}
                onChange={(event) => setComponentSign(event.target.value)}
              >
                <option value="1">Positive</option>
                <option value="-1">Negative</option>
              </select>
            </label>
            <div className="duration-tool__component-grid">
              {Object.entries(COMPONENT_LABELS).map(([key, label]) => (
                <label key={key} htmlFor={`duration-component-${key}`}>
                  {label}
                  <input
                    id={`duration-component-${key}`}
                    type="number"
                    min="0"
                    step="any"
                    value={componentValues[key]}
                    onChange={(event) => setComponentValues({
                      ...componentValues, [key]: event.target.value,
                    })}
                    aria-invalid={invalidField === 'duration-components' || undefined}
                  />
                </label>
              ))}
            </div>
            <button type="submit">Build from components</button>
          </fieldset>
        </form>
      </div>

      {error && (
        <div id="duration-error" className="duration-tool__error" role="alert">{error}</div>
      )}
      {copyStatus && (
        <div className="duration-tool__status" role="status" aria-live="polite">{copyStatus}</div>
      )}

      {result.isValid && result.usesCalendarApproximation && (
        <aside className="duration-tool__notice">
          Years and months use calendar approximations: 1 year = 365 days; 1 month = 30 days.
        </aside>
      )}

      {rows.length > 0 && (
        <section className="duration-tool__outputs" aria-label="Duration conversion results">
          {rows.map(([label, value]) => (
            <article className="duration-tool__output" key={label}>
              <div>
                <h3>{label}</h3>
                <div className="duration-tool__value" aria-label={label}>{value}</div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(label, value)}
                aria-label={`Copy ${label}`}
              >
                Copy
              </button>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
