import { useEffect, useState } from 'react';
import { convertTimestamp } from './timestamp.utils.js';
import './timestamp.css';

const UNIT_MODES = {
  AUTO: 'auto',
  SECONDS: 'seconds',
  MILLISECONDS: 'milliseconds',
};

/**
 * Renders the Timestamp Converter tool with real-time conversion,
 * unit auto-detection, timezone support, and relative time calculation.
 *
 * @returns {React.JSX.Element} The Timestamp tool UI.
 */
export default function TimestampTool() {
  const [input, setInput] = useState('');
  const [unitMode, setUnitMode] = useState(UNIT_MODES.AUTO);
  const [copiedField, setCopiedField] = useState(null);
  const [copyError, setCopyError] = useState('');
  const [nowDate, setNowDate] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNowDate(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  const result = convertTimestamp(input, unitMode, nowDate);

  function handleNow() {
    const nowSec = String(Math.floor(Date.now() / 1000));
    setInput(nowSec);
    setCopyError('');
  }

  function handleClear() {
    setInput('');
    setCopyError('');
    setCopiedField(null);
  }

  async function handleCopy(fieldKey, value) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldKey);
      setCopyError('');
      setTimeout(() => {
        setCopiedField((prev) => (prev === fieldKey ? null : prev));
      }, 1500);
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  const alertMessage = !result.isValid ? result.error : copyError;

  return (
    <section className="timestamp-tool" aria-label="Timestamp Converter Tool">
      <div className="timestamp-header">
        <div className="timestamp-input-group">
          <label className="timestamp-label" htmlFor="timestamp-input">
            Unix Timestamp or Date String
          </label>
          <div className="input-with-actions">
            <input
              id="timestamp-input"
              type="text"
              className="timestamp-input"
              placeholder="e.g. 1770000000, 1770000000000, or 2026-07-30T18:55:49"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setCopyError('');
              }}
              spellCheck={false}
            />
            <button
              type="button"
              className="btn btn-now"
              onClick={handleNow}
              title="Fill with current time"
            >
              Now
            </button>
            <button
              type="button"
              className="btn btn-clear"
              onClick={handleClear}
              disabled={!input}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="timestamp-unit-selector">
          <span className="unit-selector-label">Timestamp Unit:</span>
          <div className="mode-toggle" role="group" aria-label="Timestamp unit mode">
            <button
              type="button"
              aria-pressed={unitMode === UNIT_MODES.AUTO}
              className={`mode-btn ${unitMode === UNIT_MODES.AUTO ? 'active' : ''}`}
              onClick={() => setUnitMode(UNIT_MODES.AUTO)}
            >
              Auto
            </button>
            <button
              type="button"
              aria-pressed={unitMode === UNIT_MODES.SECONDS}
              className={`mode-btn ${unitMode === UNIT_MODES.SECONDS ? 'active' : ''}`}
              onClick={() => setUnitMode(UNIT_MODES.SECONDS)}
            >
              Seconds (s)
            </button>
            <button
              type="button"
              aria-pressed={unitMode === UNIT_MODES.MILLISECONDS}
              className={`mode-btn ${unitMode === UNIT_MODES.MILLISECONDS ? 'active' : ''}`}
              onClick={() => setUnitMode(UNIT_MODES.MILLISECONDS)}
            >
              Milliseconds (ms)
            </button>
          </div>
        </div>
      </div>

      {!result.isEmpty && result.isValid && (
        <div className="timestamp-badge" role="status">
          <span className="badge-tag">
            {result.inputType === 'timestamp'
              ? `Detected: Unix Timestamp (${result.detectedUnit})`
              : 'Detected: Date String'}
          </span>
          <span className="badge-tz">Local TZ: {result.timezone}</span>
        </div>
      )}

      {alertMessage && (
        <div className="timestamp-error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}

      <div className="timestamp-outputs">
        <div className="output-card">
          <div className="card-header">
            <label className="card-label" htmlFor="out-iso">ISO 8601</label>
            <button
              type="button"
              className="btn copy-btn"
              onClick={() => handleCopy('iso', result.iso)}
              disabled={!result.iso}
            >
              {copiedField === 'iso' ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <input
            id="out-iso"
            type="text"
            className="card-value-input"
            value={result.iso || ''}
            readOnly
            placeholder="e.g. 2026-07-30T09:55:49.000Z"
          />
        </div>

        <div className="output-card">
          <div className="card-header">
            <label className="card-label" htmlFor="out-utc">UTC Time</label>
            <button
              type="button"
              className="btn copy-btn"
              onClick={() => handleCopy('utc', result.utc)}
              disabled={!result.utc}
            >
              {copiedField === 'utc' ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <input
            id="out-utc"
            type="text"
            className="card-value-input"
            value={result.utc || ''}
            readOnly
            placeholder="e.g. Thu, 30 Jul 2026 09:55:49 GMT"
          />
        </div>

        <div className="output-card">
          <div className="card-header">
            <label className="card-label" htmlFor="out-local">
              Local Timezone ({result.timezone ? result.timezone.split(' ')[0] : 'Local'})
            </label>
            <button
              type="button"
              className="btn copy-btn"
              onClick={() => handleCopy('local', result.local)}
              disabled={!result.local}
            >
              {copiedField === 'local' ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <input
            id="out-local"
            type="text"
            className="card-value-input"
            value={result.local || ''}
            readOnly
            placeholder="e.g. 2026-07-30 18:55:49"
          />
        </div>

        <div className="output-card">
          <div className="card-header">
            <label className="card-label" htmlFor="out-sec">Unix Timestamp (Seconds)</label>
            <button
              type="button"
              className="btn copy-btn"
              onClick={() => handleCopy('unixSeconds', result.unixSeconds)}
              disabled={!result.unixSeconds}
            >
              {copiedField === 'unixSeconds' ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <input
            id="out-sec"
            type="text"
            className="card-value-input"
            value={result.unixSeconds || ''}
            readOnly
            placeholder="e.g. 1785405349"
          />
        </div>

        <div className="output-card">
          <div className="card-header">
            <label className="card-label" htmlFor="out-ms">Unix Timestamp (Milliseconds)</label>
            <button
              type="button"
              className="btn copy-btn"
              onClick={() => handleCopy('unixMs', result.unixMs)}
              disabled={!result.unixMs}
            >
              {copiedField === 'unixMs' ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <input
            id="out-ms"
            type="text"
            className="card-value-input"
            value={result.unixMs || ''}
            readOnly
            placeholder="e.g. 1785405349000"
          />
        </div>

        <div className="output-card">
          <div className="card-header">
            <label className="card-label" htmlFor="out-relative">Relative Time (상대 시간)</label>
            <button
              type="button"
              className="btn copy-btn"
              onClick={() => handleCopy('relative', result.relative)}
              disabled={!result.relative}
            >
              {copiedField === 'relative' ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <input
            id="out-relative"
            type="text"
            className="card-value-input"
            value={result.relative || ''}
            readOnly
            placeholder="e.g. 방금 전, 3분 전, 2시간 후"
          />
        </div>
      </div>
    </section>
  );
}
