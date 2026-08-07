import { useEffect, useMemo, useState } from 'react';
import { computeTextStats, formatStatsSummary } from './wordCounter.utils.js';
import './wordCounter.css';

/**
 * Renders an accessible Word & Character Counter tool component.
 * Provides live computation of word count, character counts, sentence count,
 * paragraph count, reading time, and UTF-8 byte size.
 *
 * @returns {React.JSX.Element} The Word Counter tool UI.
 */
export default function WordCounterTool() {
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');

  const stats = useMemo(() => computeTextStats(text), [text]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  function handleClear() {
    setText('');
    setNotice('Text cleared.');
  }

  async function handleCopyStats() {
    const summary = formatStatsSummary(stats);
    try {
      await navigator.clipboard.writeText(summary);
      setNotice('Stats copied to clipboard.');
    } catch {
      setNotice('Unable to copy stats to clipboard.');
    }
  }

  return (
    <section className="word-counter-tool" aria-label="Word & Character Counter Tool">
      <header className="word-counter-tool__intro">
        <span className="word-counter-tool__eyebrow">TEXT STATISTICS</span>
        <h2>Word & Character Counter</h2>
        <p>Measure words, characters, sentences, paragraphs, reading time, and byte size.</p>
      </header>

      <div className="word-counter-tool__input-panel">
        <div className="word-counter-tool__input-header">
          <label htmlFor="word-counter-input">Input text</label>
          <button
            type="button"
            className="word-counter-tool__button"
            onClick={handleClear}
            disabled={!text}
            aria-label="Clear input text"
          >
            Clear
          </button>
        </div>
        <textarea
          id="word-counter-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Type or paste text here to analyze statistics in real time…"
          spellCheck={false}
        />
      </div>

      <section className="word-counter-tool__stats" aria-label="Text Statistics Results">
        <div className="word-counter-tool__stats-header">
          <span className="word-counter-tool__stats-title">Metrics</span>
          <button
            type="button"
            className="word-counter-tool__button"
            onClick={handleCopyStats}
            aria-label="Copy stats summary"
          >
            Copy stats
          </button>
        </div>

        <div className="word-counter-tool__grid">
          <div className="word-counter-tool__card">
            <span className="word-counter-tool__card-label">Words</span>
            <span className="word-counter-tool__card-value" data-testid="stat-words">
              {stats.words.toLocaleString()}
            </span>
          </div>

          <div className="word-counter-tool__card">
            <span className="word-counter-tool__card-label">Characters (with spaces)</span>
            <span className="word-counter-tool__card-value" data-testid="stat-characters">
              {stats.characters.toLocaleString()}
            </span>
          </div>

          <div className="word-counter-tool__card">
            <span className="word-counter-tool__card-label">Characters (no spaces)</span>
            <span
              className="word-counter-tool__card-value"
              data-testid="stat-characters-no-spaces"
            >
              {stats.charactersNoSpaces.toLocaleString()}
            </span>
          </div>

          <div className="word-counter-tool__card">
            <span className="word-counter-tool__card-label">Sentences</span>
            <span className="word-counter-tool__card-value" data-testid="stat-sentences">
              {stats.sentences.toLocaleString()}
            </span>
          </div>

          <div className="word-counter-tool__card">
            <span className="word-counter-tool__card-label">Paragraphs</span>
            <span className="word-counter-tool__card-value" data-testid="stat-paragraphs">
              {stats.paragraphs.toLocaleString()}
            </span>
          </div>

          <div className="word-counter-tool__card">
            <span className="word-counter-tool__card-label">Reading Time</span>
            <span className="word-counter-tool__card-value" data-testid="stat-reading-time">
              {stats.readingTimeText}
            </span>
          </div>

          <div className="word-counter-tool__card">
            <span className="word-counter-tool__card-label">Byte Size</span>
            <span className="word-counter-tool__card-value" data-testid="stat-byte-size">
              {stats.byteSize.toLocaleString()} B
            </span>
          </div>
        </div>
      </section>

      <p className="word-counter-tool__notice" role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}
