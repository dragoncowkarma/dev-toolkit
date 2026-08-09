import { useState } from 'react';
import {
  bumpSemver,
  compareSemver,
  diffSemver,
  parseRange,
  parseSemver,
  satisfiesRange,
} from './semver.utils.js';
import './semver.css';

/**
 * SemverTool component for version comparison, range checking, and release bumping.
 *
 * @returns {React.JSX.Element} SemverTool interface.
 */
export default function SemverTool() {
  // Compare state
  const [versionA, setVersionA] = useState('1.10.0');
  const [versionB, setVersionB] = useState('1.9.0');

  // Range state
  const [rangeVersion, setRangeVersion] = useState('1.2.3');
  const [rangeInput, setRangeInput] = useState('^1.2.0');

  // Bump state
  const [bumpVersion, setBumpVersion] = useState('1.2.3');
  const [bumpReleaseType, setBumpReleaseType] = useState('minor');
  const [copyFeedback, setCopyFeedback] = useState('');

  // Recomputing Compare section
  const parsedA = parseSemver(versionA);
  const parsedB = parseSemver(versionB);
  const cmpResult = parsedA && parsedB ? compareSemver(parsedA, parsedB) : null;
  const diffResult = parsedA && parsedB ? diffSemver(parsedA, parsedB) : null;

  // Recomputing Range section
  const parsedRangeVer = parseSemver(rangeVersion);
  const parsedRangeSets = parseRange(rangeInput);
  const isRangeSatisfied =
    parsedRangeVer && parsedRangeSets
      ? satisfiesRange(parsedRangeVer, rangeInput)
      : null;

  // Recomputing Bump section
  const bumpedResult = bumpSemver(bumpVersion, bumpReleaseType);

  /**
   * Handles copying the bumped version string to clipboard.
   */
  const handleCopyBumped = async () => {
    if (!bumpedResult) return;
    try {
      await navigator.clipboard.writeText(bumpedResult);
      setCopyFeedback('Copied bumped version to clipboard!');
    } catch {
      setCopyFeedback('Failed to copy version to clipboard.');
    }
  };

  /**
   * Helper to format prerelease / build array for breakdown display.
   *
   * @param {Array} arr - Array of identifiers.
   * @returns {string} Formatted string.
   */
  const formatArray = (arr) => (arr && arr.length > 0 ? arr.join('.') : 'none');

  return (
    <section className="semver-tool" aria-labelledby="semver-tool-title">
      <header className="semver-tool__header">
        <h2 id="semver-tool-title" className="semver-tool__title">
          Semver Comparator
        </h2>
        <p className="semver-tool__description">
          Parse, compare, check ranges, and bump semantic version strings in real time.
        </p>
      </header>

      {/* 1. COMPARE SECTION */}
      <div className="semver-card" aria-label="Version comparison section">
        <h3 className="semver-card__title">1. Version Comparison</h3>

        <div className="semver-grid semver-grid--two">
          <div className="semver-field">
            <label htmlFor="version-a" className="semver-field__label">
              Version A
            </label>
            <input
              id="version-a"
              type="text"
              className="semver-input"
              value={versionA}
              onChange={(e) => setVersionA(e.target.value)}
              placeholder="e.g. 1.10.0"
              aria-label="Version A input"
            />
          </div>

          <div className="semver-field">
            <label htmlFor="version-b" className="semver-field__label">
              Version B
            </label>
            <input
              id="version-b"
              type="text"
              className="semver-input"
              value={versionB}
              onChange={(e) => setVersionB(e.target.value)}
              placeholder="e.g. 1.9.0"
              aria-label="Version B input"
            />
          </div>
        </div>

        <div className="semver-result-panel">
          {parsedA && parsedB && cmpResult !== null ? (
            <>
              <div className="semver-statement">
                <span className="semver-statement__badge">
                  {parsedA.raw}{' '}
                  {cmpResult === 1 ? '>' : cmpResult === -1 ? '<' : '='}{' '}
                  {parsedB.raw}
                </span>
                <span
                  className={`semver-diff-badge semver-diff-badge--${
                    diffResult || 'equal'
                  }`}
                >
                  Diff: {diffResult || 'equal'}
                </span>
              </div>

              <div className="semver-grid semver-grid--two">
                <div className="semver-breakdown-card">
                  <div className="semver-breakdown-card__title">
                    Version A Breakdown
                  </div>
                  <div className="semver-breakdown-table">
                    <div className="semver-breakdown-item">
                      <span className="semver-breakdown-item__key">Major</span>
                      <span className="semver-breakdown-item__val">
                        {parsedA.major}
                      </span>
                    </div>
                    <div className="semver-breakdown-item">
                      <span className="semver-breakdown-item__key">Minor</span>
                      <span className="semver-breakdown-item__val">
                        {parsedA.minor}
                      </span>
                    </div>
                    <div className="semver-breakdown-item">
                      <span className="semver-breakdown-item__key">Patch</span>
                      <span className="semver-breakdown-item__val">
                        {parsedA.patch}
                      </span>
                    </div>
                    <div className="semver-breakdown-item">
                      <span className="semver-breakdown-item__key">
                        Prerelease
                      </span>
                      <span className="semver-breakdown-item__val">
                        {formatArray(parsedA.prerelease)}
                      </span>
                    </div>
                    <div className="semver-breakdown-item">
                      <span className="semver-breakdown-item__key">Build</span>
                      <span className="semver-breakdown-item__val">
                        {formatArray(parsedA.build)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="semver-breakdown-card">
                  <div className="semver-breakdown-card__title">
                    Version B Breakdown
                  </div>
                  <div className="semver-breakdown-table">
                    <div className="semver-breakdown-item">
                      <span className="semver-breakdown-item__key">Major</span>
                      <span className="semver-breakdown-item__val">
                        {parsedB.major}
                      </span>
                    </div>
                    <div className="semver-breakdown-item">
                      <span className="semver-breakdown-item__key">Minor</span>
                      <span className="semver-breakdown-item__val">
                        {parsedB.minor}
                      </span>
                    </div>
                    <div className="semver-breakdown-item">
                      <span className="semver-breakdown-item__key">Patch</span>
                      <span className="semver-breakdown-item__val">
                        {parsedB.patch}
                      </span>
                    </div>
                    <div className="semver-breakdown-item">
                      <span className="semver-breakdown-item__key">
                        Prerelease
                      </span>
                      <span className="semver-breakdown-item__val">
                        {formatArray(parsedB.prerelease)}
                      </span>
                    </div>
                    <div className="semver-breakdown-item">
                      <span className="semver-breakdown-item__key">Build</span>
                      <span className="semver-breakdown-item__val">
                        {formatArray(parsedB.build)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="semver-placeholder">
              Enter two valid semantic versions above to compare precedence and breakdown.
            </p>
          )}
        </div>
      </div>

      {/* 2. RANGE CHECK SECTION */}
      <div className="semver-card" aria-label="Semver range check section">
        <h3 className="semver-card__title">2. Range Satisfaction Check</h3>

        <div className="semver-grid semver-grid--two">
          <div className="semver-field">
            <label htmlFor="range-version" className="semver-field__label">
              Target Version
            </label>
            <input
              id="range-version"
              type="text"
              className="semver-input"
              value={rangeVersion}
              onChange={(e) => setRangeVersion(e.target.value)}
              placeholder="e.g. 1.2.3"
              aria-label="Range target version input"
            />
          </div>

          <div className="semver-field">
            <label htmlFor="version-range" className="semver-field__label">
              Semver Range
            </label>
            <input
              id="version-range"
              type="text"
              className="semver-input"
              value={rangeInput}
              onChange={(e) => setRangeInput(e.target.value)}
              placeholder="e.g. ^1.2.0 or 1.2.3 - 2.0.0"
              aria-label="Semver range input"
            />
          </div>
        </div>

        <div>
          {rangeInput.trim() !== '' && parsedRangeSets === null ? (
            <div className="semver-range-status semver-range-status--unsupported">
              ⚠️ Unsupported range syntax
            </div>
          ) : parsedRangeVer && isRangeSatisfied !== null ? (
            <div
              className={`semver-range-status ${
                isRangeSatisfied
                  ? 'semver-range-status--satisfied'
                  : 'semver-range-status--unsatisfied'
              }`}
            >
              {isRangeSatisfied
                ? '✓ Version satisfies range'
                : '✕ Version does not satisfy range'}
            </div>
          ) : (
            <p className="semver-placeholder">
              Enter a target version and valid range string to test satisfaction.
            </p>
          )}
        </div>
      </div>

      {/* 3. BUMP SECTION */}
      <div className="semver-card" aria-label="Version bump section">
        <h3 className="semver-card__title">3. Version Bump</h3>

        <div className="semver-grid semver-grid--two">
          <div className="semver-field">
            <label htmlFor="bump-version" className="semver-field__label">
              Base Version
            </label>
            <input
              id="bump-version"
              type="text"
              className="semver-input"
              value={bumpVersion}
              onChange={(e) => setBumpVersion(e.target.value)}
              placeholder="e.g. 1.2.3"
              aria-label="Bump base version input"
            />
          </div>

          <div className="semver-field">
            <label htmlFor="bump-release-type" className="semver-field__label">
              Release Type
            </label>
            <select
              id="bump-release-type"
              className="semver-select"
              value={bumpReleaseType}
              onChange={(e) => setBumpReleaseType(e.target.value)}
              aria-label="Bump release type selector"
            >
              <option value="major">Major (x.0.0)</option>
              <option value="minor">Minor (x.y.0)</option>
              <option value="patch">Patch (x.y.z)</option>
              <option value="prerelease">Prerelease (x.y.z-n)</option>
            </select>
          </div>
        </div>

        <div className="semver-bump-output">
          <div className="semver-bump-result">
            {bumpedResult || (
              <span className="semver-placeholder">Invalid version</span>
            )}
          </div>
          <button
            type="button"
            className="semver-copy-btn"
            onClick={handleCopyBumped}
            disabled={!bumpedResult}
            aria-label="Copy bumped version"
          >
            Copy
          </button>
        </div>

        <div
          aria-live="polite"
          className="semver-status-feedback"
          role="status"
        >
          {copyFeedback}
        </div>
      </div>
    </section>
  );
}
