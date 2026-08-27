import { useEffect, useMemo, useState } from 'react';
import './line.css';
import { processLines } from './line.utils.js';

const SAMPLE_TEXT = `item10
item2
apple
Apple
item1
  banana  

apple`;

/**
 * LineToolsTool component for multi-line text manipulation:
 * sorting, deduplication, trimming, line numbering, prefixing, suffixing, and join/split.
 *
 * @returns {React.JSX.Element} The line tools UI component.
 */
export default function LineToolsTool() {
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState('');

  // Cleanup options
  const [trim, setTrim] = useState(false);
  const [removeEmpty, setRemoveEmpty] = useState(false);
  const [reverse, setReverse] = useState(false);

  // Deduplicate options
  const [dedupe, setDedupe] = useState(false);
  const [dedupeIgnoreCase, setDedupeIgnoreCase] = useState(false);

  // Sort options
  const [sortMode, setSortMode] = useState('none');
  const [naturalSort, setNaturalSort] = useState(true);
  const [caseSensitive, setCaseSensitive] = useState(false);

  // Decorate options
  const [numberLines, setNumberLines] = useState(false);
  const [startNumber, setStartNumber] = useState(1);
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');

  // Join & Split options
  const [enableCustomSplit, setEnableCustomSplit] = useState(false);
  const [splitDelimiter, setSplitDelimiter] = useState(',');
  const [joinDelimiter, setJoinDelimiter] = useState('\n');

  const result = useMemo(() => {
    return processLines(input, {
      enableCustomSplit,
      splitDelimiter,
      trim,
      removeEmpty,
      dedupe,
      dedupeIgnoreCase,
      sortMode,
      naturalSort,
      caseSensitive,
      reverse,
      numberLines,
      startNumber,
      prefix,
      suffix,
      joinDelimiter,
    });
  }, [
    input,
    enableCustomSplit,
    splitDelimiter,
    trim,
    removeEmpty,
    dedupe,
    dedupeIgnoreCase,
    sortMode,
    naturalSort,
    caseSensitive,
    reverse,
    numberLines,
    startNumber,
    prefix,
    suffix,
    joinDelimiter,
  ]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 2000);
    return () => clearTimeout(timer);
  }, [notice]);

  function handleClear() {
    setInput('');
    setNotice('Input cleared.');
  }

  function handleLoadSample() {
    setInput(SAMPLE_TEXT);
    setNotice('Loaded sample text.');
  }

  async function handleCopy() {
    if (!result.output) return;
    try {
      await navigator.clipboard.writeText(result.output);
      setNotice('Copied result to clipboard.');
    } catch {
      setNotice('Failed to copy to clipboard.');
    }
  }

  return (
    <section className="line-tools" aria-label="Line Tools">
      <div className="line-tools__header">
        <h2 className="line-tools__title">Line Tools</h2>
        <p className="line-tools__description">
          Sort, deduplicate, trim, decorate, and join/split multi-line text in real-time.
        </p>
        <div
          className="line-tools__pipeline-badge"
          aria-label={
            'Execution pipeline order: Split, Trim, Remove Empty, Deduplicate, Sort, ' +
            'Reverse, Decorate, Join'
          }
        >
          <span className="line-tools__pipeline-step">1. Split</span>
          <span className="line-tools__pipeline-arrow">→</span>
          <span className="line-tools__pipeline-step">2. Trim</span>
          <span className="line-tools__pipeline-arrow">→</span>
          <span className="line-tools__pipeline-step">3. Remove Empty</span>
          <span className="line-tools__pipeline-arrow">→</span>
          <span className="line-tools__pipeline-step">4. Deduplicate</span>
          <span className="line-tools__pipeline-arrow">→</span>
          <span className="line-tools__pipeline-step">5. Sort</span>
          <span className="line-tools__pipeline-arrow">→</span>
          <span className="line-tools__pipeline-step">6. Reverse</span>
          <span className="line-tools__pipeline-arrow">→</span>
          <span className="line-tools__pipeline-step">7. Decorate</span>
          <span className="line-tools__pipeline-arrow">→</span>
          <span className="line-tools__pipeline-step">8. Join</span>
        </div>
      </div>

      <div className="line-tools__controls" role="group" aria-label="Line Operation Options">
        {/* Cleanup Section */}
        <div className="line-tools__group" role="group" aria-label="Cleanup Options">
          <span className="line-tools__group-title">1. Cleanup & Order</span>
          <div className="line-tools__options-row">
            <label className="line-tools__checkbox-label">
              <input
                type="checkbox"
                checked={trim}
                onChange={(e) => setTrim(e.target.checked)}
              />
              Trim line whitespace
            </label>
            <label className="line-tools__checkbox-label">
              <input
                type="checkbox"
                checked={removeEmpty}
                onChange={(e) => setRemoveEmpty(e.target.checked)}
              />
              Remove empty lines
            </label>
            <label className="line-tools__checkbox-label">
              <input
                type="checkbox"
                checked={reverse}
                onChange={(e) => setReverse(e.target.checked)}
              />
              Reverse line order
            </label>
          </div>
        </div>

        {/* Deduplicate Section */}
        <div className="line-tools__group" role="group" aria-label="Deduplicate Options">
          <span className="line-tools__group-title">2. Deduplicate</span>
          <div className="line-tools__options-row">
            <label className="line-tools__checkbox-label">
              <input
                type="checkbox"
                checked={dedupe}
                onChange={(e) => setDedupe(e.target.checked)}
              />
              Remove duplicate lines
            </label>
            {dedupe && (
              <label className="line-tools__checkbox-label">
                <input
                  type="checkbox"
                  checked={dedupeIgnoreCase}
                  onChange={(e) => setDedupeIgnoreCase(e.target.checked)}
                />
                Ignore case when deduplicating
              </label>
            )}
          </div>
        </div>

        {/* Sort Section */}
        <div className="line-tools__group" role="group" aria-label="Sort Options">
          <span className="line-tools__group-title">3. Sort</span>
          <div className="line-tools__options-row">
            <label className="line-tools__inline-field">
              Direction:
              <select
                className="line-tools__select"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value)}
                aria-label="Sort direction"
              >
                <option value="none">None</option>
                <option value="asc">Ascending (A-Z)</option>
                <option value="desc">Descending (Z-A)</option>
              </select>
            </label>

            {sortMode !== 'none' && (
              <>
                <label className="line-tools__checkbox-label">
                  <input
                    type="checkbox"
                    checked={naturalSort}
                    onChange={(e) => setNaturalSort(e.target.checked)}
                  />
                  Natural sort (e.g. item2 &lt; item10)
                </label>
                <label className="line-tools__checkbox-label">
                  <input
                    type="checkbox"
                    checked={caseSensitive}
                    onChange={(e) => setCaseSensitive(e.target.checked)}
                  />
                  Case sensitive sort
                </label>
              </>
            )}
          </div>
        </div>

        {/* Decorate Section */}
        <div className="line-tools__group" role="group" aria-label="Decorate Options">
          <span className="line-tools__group-title">4. Decorate</span>
          <div className="line-tools__options-row">
            <label className="line-tools__checkbox-label">
              <input
                type="checkbox"
                checked={numberLines}
                onChange={(e) => setNumberLines(e.target.checked)}
              />
              Number lines
            </label>
            {numberLines && (
              <label className="line-tools__inline-field">
                Start number:
                <input
                  type="number"
                  className="line-tools__input line-tools__input--narrow"
                  value={startNumber}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setStartNumber(Number.isNaN(parsed) ? 1 : parsed);
                  }}
                  aria-label="Line numbering start value"
                />
              </label>
            )}
            <label className="line-tools__inline-field">
              Prefix:
              <input
                type="text"
                className="line-tools__input line-tools__input--medium"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="e.g. > "
                aria-label="Line prefix string"
              />
            </label>
            <label className="line-tools__inline-field">
              Suffix:
              <input
                type="text"
                className="line-tools__input line-tools__input--medium"
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
                placeholder="e.g. ;"
                aria-label="Line suffix string"
              />
            </label>
          </div>
        </div>

        {/* Split & Join Section */}
        <div className="line-tools__group" role="group" aria-label="Split and Join Options">
          <span className="line-tools__group-title">5. Split & Join</span>
          <div className="line-tools__options-row">
            <label className="line-tools__checkbox-label">
              <input
                type="checkbox"
                checked={enableCustomSplit}
                onChange={(e) => setEnableCustomSplit(e.target.checked)}
              />
              Custom input split delimiter
            </label>
            {enableCustomSplit && (
              <input
                type="text"
                className="line-tools__input line-tools__input--narrow"
                value={splitDelimiter}
                onChange={(e) => setSplitDelimiter(e.target.value)}
                placeholder=","
                aria-label="Custom split delimiter"
              />
            )}
            <label className="line-tools__inline-field">
              Output join delimiter:
              <select
                className="line-tools__select"
                value={joinDelimiter}
                onChange={(e) => setJoinDelimiter(e.target.value)}
                aria-label="Output join delimiter"
              >
                <option value={'\n'}>Newline (\n)</option>
                <option value=", ">Comma space (, )</option>
                <option value=",">Comma (,)</option>
                <option value=" | ">Pipe ( | )</option>
                <option value={'\t'}>Tab (\t)</option>
                <option value=" ">Space ( )</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="line-tools__main">
        {/* Input Panel */}
        <div className="line-tools__panel">
          <div className="line-tools__panel-header">
            <label className="line-tools__label" htmlFor="line-tools-input">
              Input text
            </label>
            <div className="line-tools__options-row">
              <button
                type="button"
                className="line-tools__button"
                onClick={handleLoadSample}
              >
                Sample
              </button>
              <button
                type="button"
                className="line-tools__button"
                onClick={handleClear}
              >
                Clear
              </button>
            </div>
          </div>
          <textarea
            id="line-tools-input"
            className="line-tools__textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste or type multi-line text here…"
            aria-label="Input text"
            spellCheck={false}
          />
        </div>

        {/* Output Panel */}
        <div className="line-tools__panel">
          <div className="line-tools__panel-header">
            <label className="line-tools__label" htmlFor="line-tools-output">
              Transformed result
            </label>
            <button
              type="button"
              className="line-tools__button"
              onClick={handleCopy}
              disabled={!result.output}
              aria-label="Copy transformed text to clipboard"
            >
              Copy Result
            </button>
          </div>
          <textarea
            id="line-tools-output"
            className="line-tools__textarea"
            value={result.output}
            readOnly
            placeholder="Result will appear here automatically…"
            aria-label="Transformed result"
            spellCheck={false}
          />

          {/* Stats Summary */}
          <div className="line-tools__stats" aria-label="Line manipulation statistics">
            <div className="line-tools__stat-card">
              <span className="line-tools__stat-value">{result.originalLineCount}</span>
              <span className="line-tools__stat-label">Orig Lines</span>
            </div>
            <div className="line-tools__stat-card">
              <span className="line-tools__stat-value">{result.outputLineCount}</span>
              <span className="line-tools__stat-label">Result Lines</span>
            </div>
            <div className="line-tools__stat-card">
              <span className="line-tools__stat-value">{result.originalCharCount}</span>
              <span className="line-tools__stat-label">Orig Chars</span>
            </div>
            <div className="line-tools__stat-card">
              <span className="line-tools__stat-value">{result.outputCharCount}</span>
              <span className="line-tools__stat-label">Result Chars</span>
            </div>
            <div className="line-tools__stat-card">
              <span
                className={`line-tools__stat-value ${
                  result.removedDuplicatesCount > 0 ? 'line-tools__stat-value--highlight' : ''
                }`}
              >
                {result.removedDuplicatesCount}
              </span>
              <span className="line-tools__stat-label">Removed Dupes</span>
            </div>
          </div>
        </div>
      </div>

      <p className="line-tools__notice" role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}
