import { useMemo, useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import {
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
  MIN_BATCH_SIZE,
  UUID_VERSIONS,
  formatUuid,
  generateUuidBatch,
} from './uuid.utils.js';
import './uuid.css';

const COPY_CONFIRMATION_DURATION = 1500;

/**
 * Renders the UUID/GUID generator with batch, version, format, and copy controls.
 *
 * @param {object} props Component props.
 * @param {() => void} [props.onBack] Returns to the default tool.
 * @returns {React.JSX.Element} The UUID generator UI.
 */
export default function UuidTool({ onBack }) {
  const [version, setVersion] = useState(UUID_VERSIONS.V4);
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE);
  const [uuids, setUuids] = useState(() => generateUuidBatch());
  const [uppercase, setUppercase] = useState(false);
  const [hyphens, setHyphens] = useState(true);
  const [braces, setBraces] = useState(false);
  const [copyFeedback, showCopyFeedback, dismissCopyFeedback] = useCopyFeedback({
    duration: COPY_CONFIRMATION_DURATION,
  });
  const [copyError, setCopyError] = useState('');

  const formattedUuids = useMemo(
    () =>
      uuids.map((uuid) =>
        formatUuid(uuid, {
          uppercase,
          hyphens,
          braces,
        })
      ),
    [braces, hyphens, uppercase, uuids]
  );

  const copiedIndex = copyFeedback?.type === 'item' ? copyFeedback.index : null;
  const copiedAll = copyFeedback?.type === 'all';

  function regenerate(nextVersion = version, nextBatchSize = batchSize) {
    setUuids(generateUuidBatch(nextBatchSize, nextVersion));
    dismissCopyFeedback();
    setCopyError('');
  }

  function handleVersionChange(nextVersion) {
    if (nextVersion === version) return;
    setVersion(nextVersion);
    regenerate(nextVersion);
  }

  function handleBatchSizeChange(event) {
    const parsedSize = Number.parseInt(event.target.value, 10);
    if (Number.isNaN(parsedSize)) {
      setBatchSize(MIN_BATCH_SIZE);
      return;
    }

    setBatchSize(Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, parsedSize)));
  }

  async function copyText(value, index = null) {
    try {
      await navigator.clipboard.writeText(value);
      showCopyFeedback(index === null ? { type: 'all' } : { type: 'item', index });
      setCopyError('');
    } catch {
      dismissCopyFeedback();
      setCopyError('Failed to copy to clipboard.');
    }
  }

  return (
    <section className="uuid-tool" aria-label="UUID and GUID Generator Tool">
      {onBack && (
        <div className="uuid-tool__header-row">
          <button
            className="uuid-tool__back-button"
            type="button"
            onClick={onBack}
            aria-label="Go back to tool dashboard"
          >
            <span aria-hidden="true">←</span> Back
          </button>
        </div>
      )}

      <div className="uuid-tool__settings">
        <fieldset className="uuid-tool__setting-group">
          <legend>UUID version</legend>
          <div className="uuid-tool__segmented-control">
            <button
              type="button"
              className={version === UUID_VERSIONS.V4 ? 'active' : ''}
              aria-pressed={version === UUID_VERSIONS.V4}
              onClick={() => handleVersionChange(UUID_VERSIONS.V4)}
            >
              UUID v4
            </button>
            <button
              type="button"
              className={version === UUID_VERSIONS.V7 ? 'active' : ''}
              aria-pressed={version === UUID_VERSIONS.V7}
              onClick={() => handleVersionChange(UUID_VERSIONS.V7)}
            >
              UUID v7
            </button>
          </div>
          <p>
            {version === UUID_VERSIONS.V4
              ? 'Cryptographically random identifiers.'
              : 'Time-ordered identifiers with millisecond timestamps.'}
          </p>
        </fieldset>

        <div className="uuid-tool__setting-group">
          <label htmlFor="uuid-batch-size">Batch size</label>
          <input
            id="uuid-batch-size"
            type="number"
            min={MIN_BATCH_SIZE}
            max={MAX_BATCH_SIZE}
            value={batchSize}
            onChange={handleBatchSizeChange}
          />
          <p>Generate between {MIN_BATCH_SIZE} and {MAX_BATCH_SIZE} at once.</p>
        </div>

        <fieldset className="uuid-tool__setting-group uuid-tool__format-options">
          <legend>Format</legend>
          <label>
            <input
              type="checkbox"
              checked={uppercase}
              onChange={(event) => setUppercase(event.target.checked)}
            />
            Uppercase
          </label>
          <label>
            <input
              type="checkbox"
              checked={hyphens}
              onChange={(event) => setHyphens(event.target.checked)}
            />
            Hyphens
          </label>
          <label>
            <input
              type="checkbox"
              checked={braces}
              onChange={(event) => setBraces(event.target.checked)}
            />
            Braces
          </label>
        </fieldset>
      </div>

      <div className="uuid-tool__actions">
        <div>
          <strong>{formattedUuids.length} UUIDs generated</strong>
          <span>{version.toUpperCase()} · Ready to copy</span>
        </div>
        <div className="uuid-tool__action-buttons">
          <button
            className="uuid-tool__button"
            type="button"
            onClick={() => regenerate()}
          >
            ↻ Regenerate
          </button>
          <button
            className="uuid-tool__button uuid-tool__button--primary"
            type="button"
            onClick={() => copyText(formattedUuids.join('\n'))}
            aria-label={copiedAll ? 'All UUIDs copied' : 'Copy all UUIDs'}
          >
            {copiedAll ? '✓ Copied All' : 'Copy All'}
          </button>
        </div>
      </div>

      <ol className="uuid-tool__results" aria-label="Generated UUIDs">
        {formattedUuids.map((uuid, index) => (
          <li key={uuids[index]} className="uuid-tool__result">
            <code>{uuid}</code>
            <button
              type="button"
              onClick={() => copyText(uuid, index)}
              aria-label={
                copiedIndex === index
                  ? `UUID ${index + 1} copied`
                  : `Copy UUID ${index + 1}`
              }
            >
              {copiedIndex === index ? '✓ Copied' : 'Copy'}
            </button>
          </li>
        ))}
      </ol>

      <p className="uuid-tool__copy-status" role="status" aria-live="polite">
        {copiedAll
          ? 'All UUIDs copied to clipboard.'
          : copiedIndex === null
            ? ''
            : `UUID ${copiedIndex + 1} copied to clipboard.`}
      </p>

      {copyError && (
        <div className="uuid-tool__error" role="alert">
          ⚠ {copyError}
        </div>
      )}
    </section>
  );
}
