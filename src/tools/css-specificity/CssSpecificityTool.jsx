import { useMemo, useState } from 'react';
import {
  analyzeSelectorList,
  compareSpecificity,
  sortSpecificity,
} from './cssSpecificity.utils.js';
import './cssSpecificity.css';

const SAMPLE = `main#app .card[data-state="active"]:hover::before
:where(#layout) article:is(.featured, #hero)
li:nth-child(2n of .item, #selected)`;

function tuple(analysis) {
  return `(${analysis.cascade.join(', ')})`;
}

/** Renders a local CSS Selectors Level 4 specificity calculator and comparison view. */
export default function CssSpecificityTool() {
  const [input, setInput] = useState(SAMPLE);
  const [order, setOrder] = useState('descending');
  const [comparison, setComparison] = useState({ first: '#profile .name', second: 'main .name' });
  const [status, setStatus] = useState('');
  const analyses = useMemo(() => analyzeSelectorList(input), [input]);
  const ordered = useMemo(() => sortSpecificity(analyses, order), [analyses, order]);
  const comparisonResult = useMemo(() => {
    const [first] = analyzeSelectorList(comparison.first);
    const [second] = analyzeSelectorList(comparison.second);
    if (!first || !second || first.error || second.error) return null;
    const result = compareSpecificity(first, second);
    return { first, second, winner: result === 0 ? null : result > 0 ? 'first' : 'second' };
  }, [comparison]);

  function clearInput() {
    setInput('');
    setStatus('Selector input cleared.');
  }

  async function copyResults() {
    const text = ordered.map((analysis) => (
      `${analysis.selector}: ${tuple(analysis)}${analysis.important ? ' !important' : ''}`
    )).join('\n');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setStatus('Specificity results copied to clipboard.');
    } catch {
      setStatus('Unable to copy specificity results.');
    }
  }

  return (
    <section className="css-specificity" aria-labelledby="css-specificity-title">
      <header className="css-specificity__intro">
        <p className="css-specificity__eyebrow">CSS</p>
        <h2 id="css-specificity-title">CSS Specificity Calculator</h2>
        <p>
          Inspect Selectors Level 4 specificity locally. Higher tuples win after importance
          and origin.
        </p>
      </header>

      <div className="css-specificity__actions" aria-label="Selector input actions">
        <button
          type="button"
          onClick={() => { setInput(SAMPLE); setStatus('Example selectors loaded.'); }}
        >
          Load example
        </button>
        <button type="button" onClick={clearInput}>Clear</button>
        <button type="button" onClick={copyResults} disabled={!ordered.length}>
          Copy results
        </button>
      </div>
      <label htmlFor="css-specificity-input">CSS selectors or declaration snippets</label>
      <textarea
        id="css-specificity-input"
        value={input}
        onChange={(event) => { setInput(event.target.value); setStatus(''); }}
        placeholder={'#app .button:hover\narticle:has(> img)\n'
          + 'style="color: rebeccapurple !important"'}
        spellCheck="false"
      />
      <p className="css-specificity__help">
        Separate selectors with commas or new lines. Full rules and style attributes are
        also accepted.
      </p>

      <div className="css-specificity__results-heading">
        <h3>Specificity breakdown</h3>
        <label>
          Order
          <select
            value={order}
            onChange={(event) => setOrder(event.target.value)}
            aria-label="Specificity sort order"
          >
            <option value="descending">Highest priority first</option>
            <option value="ascending">Lowest priority first</option>
          </select>
        </label>
      </div>
      {ordered.length === 0 ? (
        <p className="css-specificity__empty">
          Enter one or more selectors to calculate their priority.
        </p>
      ) : (
        <div className="css-specificity__cards" aria-live="polite">
          {ordered.map((analysis, index) => (
            <SpecificityCard
              analysis={analysis}
              index={index}
              key={`${analysis.selector}-${index}`}
            />
          ))}
        </div>
      )}

      <section className="css-specificity__compare" aria-labelledby="css-specificity-compare-title">
        <div>
          <p className="css-specificity__eyebrow">Quick comparison</p>
          <h3 id="css-specificity-compare-title">Which selector has priority?</h3>
        </div>
        <label htmlFor="css-specificity-first">First selector</label>
        <input
          id="css-specificity-first"
          value={comparison.first}
          onChange={(event) => setComparison({ ...comparison, first: event.target.value })}
        />
        <label htmlFor="css-specificity-second">Second selector</label>
        <input
          id="css-specificity-second"
          value={comparison.second}
          onChange={(event) => setComparison({ ...comparison, second: event.target.value })}
        />
        {comparisonResult ? (
          <p className="css-specificity__comparison-result" aria-live="polite">
            {comparisonResult.winner === null
              ? `Tie: both selectors have ${tuple(comparisonResult.first)}.`
              : `${comparisonResult.winner === 'first' ? 'First' : 'Second'} selector wins: ${
                tuple(comparisonResult[comparisonResult.winner])
              }.`}
          </p>
        ) : (
          <p className="css-specificity__error" role="alert">
            Enter two valid single selectors to compare.
          </p>
        )}
      </section>
      <p className="css-specificity__status" role="status" aria-live="polite">{status}</p>
    </section>
  );
}

function SpecificityCard({ analysis, index }) {
  if (analysis.error) {
    return (
      <article className="css-specificity__card css-specificity__card--error">
        <h4>Invalid selector</h4>
        <code>{analysis.selector || 'Empty input'}</code>
        <p>{analysis.error}</p>
      </article>
    );
  }
  return (
    <article className="css-specificity__card">
      <div className="css-specificity__card-heading">
        <span>#{index + 1}</span><code>{analysis.selector}</code>
        {analysis.important && <strong className="css-specificity__important">!important</strong>}
      </div>
      <div className="css-specificity__score" aria-label={`Specificity ${tuple(analysis)}`}>
        <span><b>{analysis.cascade[0]}</b><small>inline</small></span>
        <span><b>{analysis.specificity[0]}</b><small>ID</small></span>
        <span><b>{analysis.specificity[1]}</b><small>class / attr / pseudo</small></span>
        <span><b>{analysis.specificity[2]}</b><small>type / pseudo-element</small></span>
      </div>
      <p className="css-specificity__tuple">Cascade tuple {tuple(analysis)}</p>
      <div className="css-specificity__chips" aria-label="Specificity token breakdown">
        {analysis.tokens.map((item, tokenIndex) => (
          <span className="css-specificity__chip" key={`${item.type}-${item.value}-${tokenIndex}`}>
            {item.type}: {item.value} <em>+{item.specificity.join(',')}</em>
          </span>
        ))}
      </div>
    </article>
  );
}
