import { useId, useState } from 'react';
import {
  DEFAULT_PRESET_TIMEZONES,
  convertTimezone,
  formatUtcOffset,
  getNowInTimezone,
  getSupportedTimezones,
  getUtcOffsetMinutes,
  isValidTimezone,
} from './timezone.utils.js';
import './timezone.css';

/**
 * Renders the Timezone Converter / World Clock comparison tool.
 *
 * @returns {React.JSX.Element} The Timezone tool user interface.
 */
export default function TimezoneTool() {
  const sourceTzId = useId();
  const sourceDtId = useId();
  const addTzId = useId();

  const [supportedTimezones] = useState(() => getSupportedTimezones());

  const [sourceTimezone, setSourceTimezone] = useState(() => {
    try {
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (isValidTimezone(localTz)) return localTz;
    } catch {
      // Fallback if local timezone detection fails
    }
    return 'UTC';
  });

  const [sourceDateTime, setSourceDateTime] = useState(() => {
    return getNowInTimezone(sourceTimezone).dateTimeStr;
  });

  const [targetTimezones, setTargetTimezones] = useState(() => [...DEFAULT_PRESET_TIMEZONES]);

  const [selectedToAdd, setSelectedToAdd] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [copiedTimezone, setCopiedTimezone] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('info'); // 'info' | 'error' | 'success'

  const showToast = (message, type = 'info') => {
    setToastMessage(message);
    setToastType(type);
    setTimeout(() => {
      setToastMessage((current) => (current === message ? '' : current));
    }, 2500);
  };

  const handleNow = () => {
    const { dateTimeStr } = getNowInTimezone(sourceTimezone);
    setSourceDateTime(dateTimeStr);
    showToast('Reset to current local time.', 'info');
  };

  const handleSourceTimezoneChange = (newTz) => {
    const previousTz = sourceTimezone;
    setSourceTimezone(newTz);

    // Maintain equivalent moment in time when switching source timezone
    const result = convertTimezone(sourceDateTime, previousTz, newTz);
    if (result.isValid) {
      const { dateTimeStr } = getNowInTimezone(newTz, result.utcDate);
      setSourceDateTime(dateTimeStr);
    }
  };

  const handleAddTimezone = (tzToAdd) => {
    const tz = tzToAdd || selectedToAdd;
    if (!tz) return;

    if (!isValidTimezone(tz)) {
      showToast(`Invalid timezone: ${tz}`, 'error');
      return;
    }

    if (targetTimezones.includes(tz)) {
      showToast(`${tz} is already in your comparison list.`, 'info');
      return;
    }

    setTargetTimezones((prev) => [...prev, tz]);
    setSelectedToAdd('');
    setFilterQuery('');
    showToast(`Added ${tz} to comparison list.`, 'success');
  };

  const handleRemoveTimezone = (tzToRemove) => {
    setTargetTimezones((prev) => prev.filter((tz) => tz !== tzToRemove));
    showToast(`Removed ${tzToRemove}.`, 'info');
  };

  const handleResetPresets = () => {
    setTargetTimezones([...DEFAULT_PRESET_TIMEZONES]);
    showToast('Reset target list to default presets.', 'info');
  };

  const handleCopyTime = async (tzName, timeString) => {
    if (!timeString) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(timeString);
      setCopiedTimezone(tzName);
      showToast(`Copied ${tzName} time (${timeString}) to clipboard!`, 'success');
      setTimeout(() => {
        setCopiedTimezone((prev) => (prev === tzName ? null : prev));
      }, 2000);
    } catch {
      showToast('Failed to copy to clipboard.', 'error');
    }
  };

  const filteredTimezonesToAdd = supportedTimezones.filter((tz) => {
    if (targetTimezones.includes(tz)) return false;
    if (!filterQuery.trim()) return true;
    return tz.toLowerCase().includes(filterQuery.toLowerCase().trim());
  });

  const sourceOffsetMinutes = getUtcOffsetMinutes(new Date(), sourceTimezone);
  const sourceOffsetStr = formatUtcOffset(sourceOffsetMinutes);

  return (
    <section className="timezone-tool" aria-label="Timezone Converter Tool">
      {toastMessage && (
        <div
          className={`timezone-toast toast-${toastType}`}
          role={toastType === 'error' ? 'alert' : 'status'}
        >
          {toastType === 'error' ? '⚠ ' : '✓ '}
          {toastMessage}
        </div>
      )}

      <div className="timezone-controls-card">
        <h2 className="controls-heading">Source Date & Time</h2>

        <div className="controls-grid">
          <div className="control-group">
            <label className="control-label" htmlFor={sourceTzId}>
              Source Timezone
            </label>
            <select
              id={sourceTzId}
              className="control-select"
              value={sourceTimezone}
              onChange={(e) => handleSourceTimezoneChange(e.target.value)}
              aria-label="Source timezone selection"
            >
              {supportedTimezones.map((tz) => (
                <option key={`src-${tz}`} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <span className="control-hint">Source offset: {sourceOffsetStr}</span>
          </div>

          <div className="control-group">
            <label className="control-label" htmlFor={sourceDtId}>
              Source Date & Time
            </label>
            <div className="input-with-now">
              <input
                id={sourceDtId}
                type="datetime-local"
                className="control-input"
                value={sourceDateTime}
                onChange={(e) => setSourceDateTime(e.target.value)}
                aria-label="Source date and time input"
              />
              <button
                type="button"
                className="btn btn-now"
                onClick={handleNow}
                aria-label="Reset to current time in source timezone"
                title="Reset to current time in source timezone"
              >
                Now
              </button>
            </div>
            <span className="control-hint">Format: YYYY-MM-DD THH:mm</span>
          </div>
        </div>
      </div>

      <div className="timezone-add-card">
        <h2 className="controls-heading">Add Target Timezone</h2>
        <div className="add-controls">
          <div className="search-select-group">
            <input
              type="text"
              className="search-input"
              placeholder="Search timezones (e.g. Seoul, London)..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              aria-label="Filter target timezone list"
            />
            <select
              id={addTzId}
              className="control-select"
              value={selectedToAdd}
              onChange={(e) => setSelectedToAdd(e.target.value)}
              aria-label="Select target timezone to add"
            >
              <option value="">-- Select timezone --</option>
              {filteredTimezonesToAdd.map((tz) => (
                <option key={`add-${tz}`} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div className="add-actions">
            <button
              type="button"
              className="btn btn-add"
              onClick={() => handleAddTimezone()}
              disabled={!selectedToAdd}
              aria-label="Add selected timezone to comparison list"
            >
              + Add Timezone
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleResetPresets}
              aria-label="Reset target timezones to default presets"
            >
              Reset Presets
            </button>
          </div>
        </div>
      </div>

      <div className="timezone-results-section">
        <div className="results-header">
          <h2 className="results-heading">Target Comparison Board</h2>
          <span className="results-count">{targetTimezones.length} Timezone(s)</span>
        </div>

        <div className="timezone-grid" role="status" aria-live="polite">
          {targetTimezones.length === 0 ? (
            <div className="empty-state">
              No target timezones selected. Use the selector above to add timezones.
            </div>
          ) : (
            targetTimezones.map((tz) => {
              const converted = convertTimezone(sourceDateTime, sourceTimezone, tz);
              const isCopied = copiedTimezone === tz;

              if (!converted.isValid) {
                return (
                  <div key={tz} className="timezone-row card-error" role="alert">
                    <div className="row-header">
                      <span className="tz-title">{tz}</span>
                      <button
                        type="button"
                        className="btn btn-remove"
                        onClick={() => handleRemoveTimezone(tz)}
                        aria-label={`Remove ${tz}`}
                      >
                        ✕
                      </button>
                    </div>
                    <p className="error-text">⚠ {converted.error}</p>
                  </div>
                );
              }

              return (
                <div key={tz} className="timezone-card">
                  <div className="card-top">
                    <div className="tz-info">
                      <h3 className="tz-name">{tz}</h3>
                      <div className="tz-meta-badges">
                        <span className="offset-badge">{converted.offsetStr}</span>
                        {converted.dayDiff === 0 ? (
                          <span
                            className="day-badge day-same"
                            aria-label="Same calendar day as source"
                          >
                            Same day
                          </span>
                        ) : converted.dayDiff > 0 ? (
                          <span
                            className="day-badge day-next"
                            aria-label={`Next day relative to source (${converted.dayDiffLabel})`}
                          >
                            {converted.dayDiffLabel} (Next day)
                          </span>
                        ) : (
                          <span
                            className="day-badge day-prev"
                            aria-label={
                              `Previous day relative to source (${converted.dayDiffLabel})`
                            }
                          >
                            {converted.dayDiffLabel} (Previous day)
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-remove"
                      onClick={() => handleRemoveTimezone(tz)}
                      aria-label={`Remove ${tz}`}
                      title={`Remove ${tz}`}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="card-body">
                    <div className="time-display">
                      <span className="local-time">{converted.localTime}</span>
                      <span className="local-date">{converted.localDate}</span>
                    </div>

                    <div className="card-actions">
                      <button
                        type="button"
                        className={`btn copy-btn ${isCopied ? 'copied' : ''}`}
                        onClick={() => handleCopyTime(tz, converted.localDateTime)}
                        aria-label={isCopied ? `${tz} time copied` : `Copy ${tz} local time`}
                      >
                        {isCopied ? '✓ Copied' : '📋 Copy Time'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
