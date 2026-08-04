import { useMemo, useState } from 'react';
import {
  DEFAULT_LOREM_COUNT,
  LOREM_UNITS,
  MAX_LOREM_COUNT,
  MIN_LOREM_COUNT,
  generateLoremIpsum,
  getLoremIpsumStatistics,
} from './loremIpsum.utils.js';
import './loremIpsum.css';

/**
 * Renders configurable placeholder text generation with copy feedback.
 *
 * @param {object} props Component props.
 * @param {() => void} [props.onBack] Returns to the tool dashboard.
 * @returns {React.JSX.Element} The Lorem Ipsum generator UI.
 */
export default function LoremIpsumTool({ onBack }) {
  const [unit, setUnit] = useState(LOREM_UNITS.PARAGRAPHS);
  const [count, setCount] = useState(DEFAULT_LOREM_COUNT);
  const [startWithLorem, setStartWithLorem] = useState(true);
  const [includeHtml, setIncludeHtml] = useState(false);
  const [regeneration, setRegeneration] = useState(0);
  const [copyStatus, setCopyStatus] = useState('');

  const output = useMemo(
    () => generateLoremIpsum({ unit, count, startWithLorem, includeHtml, regeneration }),
    [count, includeHtml, regeneration, startWithLorem, unit]
  );
  const statistics = useMemo(() => getLoremIpsumStatistics(output), [output]);

  function updateCount(nextCount) {
    const parsedCount = Number.parseInt(nextCount, 10);
    const safeCount = Number.isNaN(parsedCount) ? MIN_LOREM_COUNT : parsedCount;
    setCount(Math.min(MAX_LOREM_COUNT, Math.max(MIN_LOREM_COUNT, safeCount)));
  }

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(output);
      setCopyStatus('Lorem Ipsum copied to clipboard.');
    } catch {
      setCopyStatus('Unable to copy Lorem Ipsum.');
    }
  }

  return (
    <section className="lorem-ipsum" aria-label="Lorem Ipsum Generator Tool">
      {onBack && (
        <div className="lorem-ipsum__header-row">
          <button
            className="lorem-ipsum__back-button"
            type="button"
            onClick={onBack}
            aria-label="Go back to tool dashboard"
          >
            <span aria-hidden="true">←</span> Back
          </button>
        </div>
      )}

      <div className="lorem-ipsum__settings">
        <fieldset className="lorem-ipsum__setting-group">
          <legend>Generate by</legend>
          <div className="lorem-ipsum__unit-options">
            {Object.values(LOREM_UNITS).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="lorem-unit"
                  value={value}
                  checked={unit === value}
                  onChange={() => setUnit(value)}
                />
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="lorem-ipsum__setting-group">
          <label htmlFor="lorem-count">Quantity</label>
          <div className="lorem-ipsum__quantity-control">
            <button
              type="button"
              onClick={() => updateCount(count - 1)}
              disabled={count === MIN_LOREM_COUNT}
              aria-label="Decrease quantity"
            >
              −
            </button>
            <input
              id="lorem-count"
              type="number"
              min={MIN_LOREM_COUNT}
              max={MAX_LOREM_COUNT}
              value={count}
              onChange={(event) => updateCount(event.target.value)}
              aria-label="Quantity"
            />
            <button
              type="button"
              onClick={() => updateCount(count + 1)}
              disabled={count === MAX_LOREM_COUNT}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <p>Generate between {MIN_LOREM_COUNT} and {MAX_LOREM_COUNT} units.</p>
        </div>

        <fieldset className="lorem-ipsum__setting-group lorem-ipsum__options">
          <legend>Options</legend>
          <label>
            <input
              type="checkbox"
              checked={startWithLorem}
              onChange={(event) => setStartWithLorem(event.target.checked)}
            />
            Start with “Lorem ipsum...”
          </label>
          <label>
            <input
              type="checkbox"
              checked={includeHtml}
              onChange={(event) => setIncludeHtml(event.target.checked)}
            />
            Include &lt;p&gt; tags
          </label>
        </fieldset>
      </div>

      <div className="lorem-ipsum__summary" aria-live="polite">
        <span>{statistics.wordCount} words</span>
        <span>{statistics.characterCount} characters</span>
        <div className="lorem-ipsum__action-buttons">
          <button
            className="lorem-ipsum__button"
            type="button"
            onClick={() => {
              setRegeneration((value) => value + 1);
              setCopyStatus('Generated a new Lorem Ipsum variation.');
            }}
          >
            ↻ Regenerate
          </button>
          <button
            className="lorem-ipsum__button lorem-ipsum__button--primary"
            type="button"
            onClick={copyOutput}
            aria-label="Copy generated Lorem Ipsum"
          >
            Copy text
          </button>
        </div>
      </div>

      <label className="lorem-ipsum__output-label" htmlFor="lorem-output">Generated text</label>
      <textarea
        id="lorem-output"
        className="lorem-ipsum__output"
        value={output}
        readOnly
        aria-label="Generated Lorem Ipsum text"
      />
      <p className="lorem-ipsum__status" role="status" aria-live="polite">
        {copyStatus}
      </p>
    </section>
  );
}
