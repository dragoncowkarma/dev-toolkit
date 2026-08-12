import { useEffect, useState } from 'react';
import {
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
  MIN_BATCH_SIZE,
  decodeUlid,
  generateUlidBatch,
  parseTimestampInput,
} from './ulid.utils.js';
import './ulid.css';

const COPY_CONFIRMATION_DURATION = 1500;

/**
 * Renders controls for generating and inspecting ULIDs entirely in the browser.
 *
 * @param {object} props Component props.
 * @param {() => void} [props.onBack] Returns to the default tool.
 * @returns {React.JSX.Element} The ULID generator and inspector UI.
 */
export default function UlidTool({ onBack }) {
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE);
  const [useCurrentTime, setUseCurrentTime] = useState(true);
  const [timestampInput, setTimestampInput] = useState('');
  const [monotonic, setMonotonic] = useState(true);
  const [ulids, setUlids] = useState(() => generateUlidBatch());
  const [generationError, setGenerationError] = useState('');
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [inspectionInput, setInspectionInput] = useState('');
  const [inspection, setInspection] = useState(null);
  const [inspectionError, setInspectionError] = useState('');

  useEffect(() => {
    if (copiedIndex === null && !copiedAll) return undefined;

    const timer = setTimeout(() => {
      setCopiedIndex(null);
      setCopiedAll(false);
    }, COPY_CONFIRMATION_DURATION);
    return () => clearTimeout(timer);
  }, [copiedAll, copiedIndex]);

  function handleBatchSizeChange(event) {
    const parsedSize = Number.parseInt(event.target.value, 10);
    setBatchSize(
      Number.isNaN(parsedSize)
        ? MIN_BATCH_SIZE
        : Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, parsedSize))
    );
  }

  function generate() {
    try {
      const timestamp = useCurrentTime ? Date.now() : parseTimestampInput(timestampInput);
      const nextUlids = generateUlidBatch(batchSize, timestamp, monotonic);
      setUlids(nextUlids);
      setGenerationError('');
      setCopiedIndex(null);
      setCopiedAll(false);
      setCopyError('');
      setInspectionInput(nextUlids[0]);
      setInspection(decodeUlid(nextUlids[0]));
      setInspectionError('');
    } catch (error) {
      setGenerationError(error.message);
    }
  }

  async function copyText(value, index = null) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API is unavailable.');
      await navigator.clipboard.writeText(value);
      setCopiedIndex(index);
      setCopiedAll(index === null);
      setCopyError('');
    } catch {
      setCopiedIndex(null);
      setCopiedAll(false);
      setCopyError('Failed to copy to clipboard.');
    }
  }

  function inspect() {
    try {
      setInspection(decodeUlid(inspectionInput));
      setInspectionError('');
    } catch (error) {
      setInspection(null);
      setInspectionError(error.message);
    }
  }

  return (
    <section className="ulid-tool" aria-label="ULID Generator and Inspector Tool">
      {onBack && (
        <div className="ulid-tool__header-row">
          <button
            className="ulid-tool__button ulid-tool__back-button"
            type="button"
            onClick={onBack}
            aria-label="Go back to tool dashboard"
          >
            <span aria-hidden="true">←</span> Back
          </button>
        </div>
      )}

      <div className="ulid-tool__panel">
        <div className="ulid-tool__panel-heading">
          <div>
            <p className="ulid-tool__eyebrow">Generate</p>
            <h2>Sortable, 128-bit identifiers</h2>
          </div>
          <p>48-bit timestamp + 80-bit cryptographic randomness</p>
        </div>

        <div className="ulid-tool__settings">
          <label className="ulid-tool__field" htmlFor="ulid-batch-size">
            <span>Batch size</span>
            <input
              id="ulid-batch-size"
              type="number"
              aria-label="Batch size"
              min={MIN_BATCH_SIZE}
              max={MAX_BATCH_SIZE}
              value={batchSize}
              onChange={handleBatchSizeChange}
            />
            <small>{MIN_BATCH_SIZE} to {MAX_BATCH_SIZE} ULIDs per batch</small>
          </label>

          <fieldset className="ulid-tool__time-options">
            <legend>Timestamp</legend>
            <label>
              <input
                type="radio"
                name="ulid-time-source"
                checked={useCurrentTime}
                onChange={() => setUseCurrentTime(true)}
              />
              Current time
            </label>
            <label>
              <input
                type="radio"
                name="ulid-time-source"
                checked={!useCurrentTime}
                onChange={() => setUseCurrentTime(false)}
              />
              Custom time
            </label>
          </fieldset>

          {!useCurrentTime && (
            <label className="ulid-tool__field ulid-tool__field--wide" htmlFor="ulid-timestamp">
              <span>ISO 8601 or Unix milliseconds</span>
              <input
                id="ulid-timestamp"
                type="text"
                aria-label="ISO 8601 or Unix milliseconds"
                value={timestampInput}
                onChange={(event) => setTimestampInput(event.target.value)}
                placeholder="2023-11-14T22:13:20.000Z or 1700000000000"
              />
            </label>
          )}

          <label className="ulid-tool__checkbox">
            <input
              type="checkbox"
              checked={monotonic}
              onChange={(event) => setMonotonic(event.target.checked)}
            />
            <span>
              <strong>Monotonic batch</strong>
              <small>
                Increment randomness so same-millisecond results sort in generation order.
              </small>
            </span>
          </label>
        </div>

        <div className="ulid-tool__actions">
          <button
            className="ulid-tool__button ulid-tool__button--primary"
            type="button"
            onClick={generate}
          >
            Generate {batchSize} {batchSize === 1 ? 'ULID' : 'ULIDs'}
          </button>
          <button
            className="ulid-tool__button"
            type="button"
            onClick={() => copyText(ulids.join('\n'))}
          >
            {copiedAll ? '✓ Copied all' : 'Copy all'}
          </button>
        </div>
        {generationError && <p className="ulid-tool__error" role="alert">{generationError}</p>}
        {copyError && <p className="ulid-tool__error" role="alert">{copyError}</p>}
        <p className="ulid-tool__status" role="status" aria-live="polite">
          {copiedAll
            ? 'All ULIDs copied to clipboard.'
            : copiedIndex === null
              ? ''
              : `ULID ${copiedIndex + 1} copied to clipboard.`}
        </p>

        <ol className="ulid-tool__results" aria-label="Generated ULIDs">
          {ulids.map((ulid, index) => (
            <li key={ulid}>
              <code>{ulid}</code>
              <button
                type="button"
                onClick={() => copyText(ulid, index)}
                aria-label={`Copy ULID ${index + 1}`}
              >
                {copiedIndex === index ? '✓ Copied' : 'Copy'}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="ulid-tool__panel">
        <div className="ulid-tool__panel-heading">
          <div>
            <p className="ulid-tool__eyebrow">Inspect</p>
            <h2>Decode a ULID</h2>
          </div>
          <p>Input is case-insensitive; I, L, O, and U are not allowed.</p>
        </div>

        <label className="ulid-tool__field" htmlFor="ulid-inspection-input">
          <span>ULID</span>
          <input
            id="ulid-inspection-input"
            type="text"
            aria-label="ULID"
            value={inspectionInput}
            onChange={(event) => setInspectionInput(event.target.value)}
            placeholder="01HF7YAT00XKMMT0Y8R0AZ2W9A"
            spellCheck="false"
          />
        </label>
        <div className="ulid-tool__actions">
          <button
            className="ulid-tool__button ulid-tool__button--primary"
            type="button"
            onClick={inspect}
          >
            Inspect ULID
          </button>
        </div>
        {inspectionError && <p className="ulid-tool__error" role="alert">{inspectionError}</p>}

        {inspection && (
          <dl className="ulid-tool__details" aria-label="Decoded ULID details">
            <div><dt>Canonical ULID</dt><dd><code>{inspection.ulid}</code></dd></div>
            <div><dt>Unix milliseconds</dt><dd>{inspection.timestamp}</dd></div>
            <div><dt>UTC (ISO 8601)</dt><dd>{inspection.iso}</dd></div>
            <div><dt>Local time</dt><dd>{inspection.local}</dd></div>
            <div>
              <dt>Randomness (Base32)</dt>
              <dd><code>{inspection.randomnessBase32}</code></dd>
            </div>
            <div><dt>Randomness (hex)</dt><dd><code>{inspection.randomnessHex}</code></dd></div>
          </dl>
        )}
      </div>
    </section>
  );
}
