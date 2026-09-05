import { useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_NANOID_ALPHABET,
  DEFAULT_NANOID_LENGTH,
  MAX_BATCH_SIZE,
  MAX_IDENTIFIER_LENGTH,
  clampBatchSize,
  clampIdentifierLength,
  generateIdentifierBatch,
  inspectIdentifier,
  normalizeNanoIdAlphabet,
} from './nanoidCuid.utils.js';
import './nanoidCuid.css';

const FORMATS = {
  NANOID: 'nanoid',
  CUID2: 'cuid2',
};

/**
 * Renders client-side NanoID and CUID2 generation with shape inspection.
 * @returns {React.JSX.Element}
 */
export default function NanoIdCuidGenerator() {
  const [format, setFormat] = useState(FORMATS.NANOID);
  const [nanoIdLength, setNanoIdLength] = useState(DEFAULT_NANOID_LENGTH);
  const [nanoIdAlphabet, setNanoIdAlphabet] = useState(DEFAULT_NANOID_ALPHABET);
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE);
  const [generatedIds, setGeneratedIds] = useState('');
  const [inspectInput, setInspectInput] = useState('');
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });

  const inspection = inspectIdentifier(inspectInput, { nanoIdAlphabet, nanoIdLength });

  function handleGenerate() {
    try {
      const normalizedLength = clampIdentifierLength(nanoIdLength);
      const normalizedBatchSize = clampBatchSize(batchSize);
      const normalizedAlphabet = normalizeNanoIdAlphabet(nanoIdAlphabet);
      setNanoIdLength(normalizedLength);
      setBatchSize(normalizedBatchSize);
      setNanoIdAlphabet(normalizedAlphabet);
      setGeneratedIds(
        generateIdentifierBatch(format, normalizedBatchSize, {
          length: normalizedLength,
          alphabet: normalizedAlphabet,
        })
      );
      setError('');
      setCopyError('');
    } catch (generationError) {
      setError(generationError.message);
    }
  }

  async function handleCopy() {
    if (!generatedIds) return;
    try {
      await navigator.clipboard.writeText(generatedIds);
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  function handleNumericChange(event, setter) {
    setter(event.target.value);
  }

  function handleNumericBlur(setter, clampValue) {
    setter((value) => clampValue(value));
  }

  const alertMessage = error || copyError;

  return (
    <section className="nanoid-cuid-tool" aria-label="NanoID and CUID2 Generator">
      <div className="nanoid-cuid-toolbar">
        <fieldset className="nanoid-cuid-format">
          <legend>Identifier format</legend>
          <label>
            <input
              type="radio"
              name="identifier-format"
              value={FORMATS.NANOID}
              checked={format === FORMATS.NANOID}
              onChange={() => setFormat(FORMATS.NANOID)}
            />
            NanoID
          </label>
          <label>
            <input
              type="radio"
              name="identifier-format"
              value={FORMATS.CUID2}
              checked={format === FORMATS.CUID2}
              onChange={() => setFormat(FORMATS.CUID2)}
            />
            CUID2
          </label>
        </fieldset>

        <div className="nanoid-cuid-settings">
          {format === FORMATS.NANOID && (
            <>
              <label htmlFor="nanoid-length">
                NanoID length
                <input
                  id="nanoid-length"
                  type="number"
                  min="1"
                  max={MAX_IDENTIFIER_LENGTH}
                  value={nanoIdLength}
                  onChange={(event) => handleNumericChange(event, setNanoIdLength)}
                  onBlur={() => handleNumericBlur(setNanoIdLength, clampIdentifierLength)}
                />
              </label>
              <label htmlFor="nanoid-alphabet">
                NanoID alphabet
                <input
                  id="nanoid-alphabet"
                  value={nanoIdAlphabet}
                  onChange={(event) => setNanoIdAlphabet(event.target.value)}
                  spellCheck={false}
                />
              </label>
            </>
          )}
          <label htmlFor="batch-size">
            Batch size
            <input
              id="batch-size"
              type="number"
              min="1"
              max={MAX_BATCH_SIZE}
              value={batchSize}
              onChange={(event) => handleNumericChange(event, setBatchSize)}
              onBlur={() => handleNumericBlur(setBatchSize, clampBatchSize)}
            />
          </label>
          <button type="button" className="nanoid-cuid-button primary" onClick={handleGenerate}>
            Generate {format === FORMATS.NANOID ? 'NanoID' : 'CUID2'}
          </button>
        </div>
      </div>

      <div className="nanoid-cuid-panel">
        <div className="nanoid-cuid-label-row">
          <label htmlFor="generated-identifiers">Generated identifiers</label>
          <button
            type="button"
            className="nanoid-cuid-button"
            onClick={handleCopy}
            disabled={!generatedIds}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          {copied && (
            <div className="sr-only" role="status" aria-live="polite">
              Copied to clipboard
            </div>
          )}
        </div>
        <textarea
          id="generated-identifiers"
          value={generatedIds}
          readOnly
          placeholder="Generated IDs will appear here…"
          spellCheck={false}
        />
      </div>

      <div className="nanoid-cuid-panel">
        <label htmlFor="inspect-identifier">Validate or inspect an identifier</label>
        <input
          id="inspect-identifier"
          value={inspectInput}
          onChange={(event) => setInspectInput(event.target.value)}
          placeholder="Paste a NanoID or CUID2…"
          spellCheck={false}
        />
        {inspectInput && (
          <dl className="nanoid-cuid-inspection" aria-live="polite">
            <div>
              <dt>Format guess</dt>
              <dd>{inspection.format}</dd>
            </div>
            <div>
              <dt>Length</dt>
              <dd>{inspection.length}</dd>
            </div>
            <div>
              <dt>Alphabet</dt>
              <dd>{inspection.alphabet || 'No recognized format'}</dd>
            </div>
          </dl>
        )}
      </div>

      {alertMessage && (
        <div className="nanoid-cuid-error" role="alert">
          {alertMessage}
        </div>
      )}
    </section>
  );
}
