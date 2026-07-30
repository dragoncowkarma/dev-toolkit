import React, { useState, useMemo } from 'react';
import { REGEX_PRESETS, runRegex } from './regex.utils.js';
import './regex.css';

const FLAGS = ['g', 'i', 'm', 's', 'u'];

/**
 * Renders the Regex Tester tool for real-time testing and visualization of regular expressions.
 *
 * @returns {React.JSX.Element} The Regex Tester UI.
 */
export default function RegexTool() {
  const defaultPreset = REGEX_PRESETS[0];
  const [pattern, setPattern] = useState(defaultPreset.pattern);
  const [flags, setFlags] = useState(defaultPreset.flags);
  const [testText, setTestText] = useState(defaultPreset.testText);
  const [selectedPreset, setSelectedPreset] = useState(defaultPreset.id);

  // Compute regex matches and highlighting segments in real time.
  const result = useMemo(() => {
    return runRegex(pattern, flags, testText);
  }, [pattern, flags, testText]);

  function handlePatternChange(e) {
    setPattern(e.target.value);
    setSelectedPreset('');
  }

  function handleTestTextChange(e) {
    setTestText(e.target.value);
  }

  function toggleFlag(flag) {
    let newFlags;
    if (flags.includes(flag)) {
      newFlags = flags.replace(flag, '');
    } else {
      const flagSet = new Set([...flags, flag]);
      newFlags = FLAGS.filter((f) => flagSet.has(f)).join('');
    }
    setFlags(newFlags);
    setSelectedPreset('');
  }

  function handlePresetChange(e) {
    const presetId = e.target.value;
    setSelectedPreset(presetId);
    const preset = REGEX_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setPattern(preset.pattern);
      setFlags(preset.flags);
      setTestText(preset.testText);
    }
  }

  function handleClear() {
    setPattern('');
    setFlags('g');
    setTestText('');
    setSelectedPreset('');
  }

  return (
    <section className="regex-tool" aria-label="Regex Tester Tool">
      <div className="regex-toolbar">
        <div className="regex-preset-wrapper">
          <select
            id="regex-preset-select"
            className="regex-preset-select"
            value={selectedPreset}
            onChange={handlePresetChange}
            aria-label="Regex Presets"
          >
            <option value="">Select a preset...</option>
            {REGEX_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        <button type="button" className="regex-btn" onClick={handleClear}>
          Clear
        </button>
      </div>

      <div className="regex-expression-bar">
        <span className="regex-slash">/</span>
        <input
          id="regex-pattern-input"
          type="text"
          className="regex-pattern-input"
          placeholder="Enter regular expression..."
          value={pattern}
          onChange={handlePatternChange}
          aria-label="Regular expression pattern"
          spellCheck={false}
        />
        <span className="regex-slash">/</span>
        <div className="regex-flags-group" role="group" aria-label="Regex flags">
          {FLAGS.map((flag) => {
            const isActive = flags.includes(flag);
            return (
              <button
                key={flag}
                type="button"
                aria-pressed={isActive}
                className={`regex-flag-btn ${isActive ? 'active' : ''}`}
                onClick={() => toggleFlag(flag)}
                aria-label={`Toggle flag ${flag}`}
              >
                {flag}
              </button>
            );
          })}
        </div>
      </div>

      {!result.isValid && result.error && (
        <div className="regex-error" role="alert">
          <span>⚠</span> {result.error}
        </div>
      )}

      <div className="regex-panels">
        <div className="regex-panel">
          <div className="regex-panel-header">
            <label className="regex-panel-label" htmlFor="regex-test-text">
              Test Text
            </label>
          </div>
          <textarea
            id="regex-test-text"
            className="regex-textarea"
            placeholder="Enter test text here..."
            value={testText}
            onChange={handleTestTextChange}
            spellCheck={false}
          />
        </div>

        <div className="regex-panel">
          <div className="regex-panel-header">
            <span className="regex-panel-label">Highlight Preview</span>
          </div>
          <div
            className="regex-highlight-preview"
            aria-label="Match Highlight Preview"
          >
            {result.segments.map((seg, idx) => {
              if (seg.type === 'match') {
                if (seg.length === 0) {
                  return (
                    <mark
                      key={idx}
                      className="match-highlight zero-width"
                      title={`Zero-width match #${seg.matchIndex + 1} at index ${seg.index}`}
                    >
                      |
                    </mark>
                  );
                }
                return (
                  <mark
                    key={idx}
                    className="match-highlight"
                    title={`Match #${seg.matchIndex + 1} at index ${seg.index}`}
                  >
                    {seg.text}
                  </mark>
                );
              }
              return <span key={idx}>{seg.text}</span>;
            })}
          </div>
        </div>
      </div>

      <div className="regex-match-info" aria-label="Match Information">
        <span
          className={`regex-match-count ${
            result.matches.length > 0 ? 'regex-match-count--has-matches' : ''
          }`}
        >
          {result.matches.length} {result.matches.length === 1 ? 'match' : 'matches'} found
        </span>
      </div>

      {result.matches.length === 0 ? (
        <div className="regex-no-matches">No matches found.</div>
      ) : (
        <div className="regex-match-list" aria-label="Matches List">
          {result.matches.map((m, matchIdx) => (
            <div className="regex-match-card" key={matchIdx}>
              <div className="regex-match-card__header">
                <span className="regex-match-card__title">Match #{matchIdx + 1}</span>
                <span>
                  Index: {m.index} | Length: {m.length}
                </span>
              </div>
              <div className="regex-match-card__text">{m.text}</div>
              {m.groups.length > 0 && (
                <table
                  className="regex-groups-table"
                  aria-label={`Capture groups for Match #${matchIdx + 1}`}
                >
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.groups.map((groupVal, gIdx) => (
                      <tr key={gIdx}>
                        <td>Group #{gIdx + 1}</td>
                        <td className="group-value">
                          {groupVal !== undefined ? groupVal : <em>undefined</em>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
