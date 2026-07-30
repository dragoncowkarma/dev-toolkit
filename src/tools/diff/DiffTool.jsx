import { useMemo, useRef, useState } from 'react';
import { computeTextDiff, readFileAsText } from './diff.utils.js';
import './diff.css';

const VIEW_MODES = {
  SIDE_BY_SIDE: 'side-by-side',
  UNIFIED: 'unified',
};

/**
 * Renders one line's tokens, keeping only the additions/deletions that
 * belong to the given side so each column highlights its own changes.
 * @param {{tokens: Array<{type: string, value: string}>, side: 'left'|'right'}} props
 * @returns {React.JSX.Element[]}
 */
function InlineTokens({ tokens, side }) {
  return tokens.map((token, index) => {
    if (token.type === 'equal') {
      return <span key={index}>{token.value}</span>;
    }
    if (token.type === 'delete' && side === 'left') {
      return (
        <span key={index} className="diff-token diff-token--removed">
          {token.value}
        </span>
      );
    }
    if (token.type === 'insert' && side === 'right') {
      return (
        <span key={index} className="diff-token diff-token--added">
          {token.value}
        </span>
      );
    }
    return null;
  });
}

/**
 * Renders one side-by-side column's content: inline token highlighting for
 * modified rows, plain text otherwise.
 * @param {{line: {number: number, content: string}|null, row: object, side: 'left'|'right'}} props
 * @returns {React.JSX.Element|string}
 */
function SideBySideCellContent({ line, row, side }) {
  if (!line) return '';
  if (row.type === 'modified') return <InlineTokens tokens={row.tokens} side={side} />;
  return line.content;
}

/**
 * Renders the two-column side-by-side diff view.
 * @param {{rows: Array<object>}} props
 * @returns {React.JSX.Element}
 */
function SideBySideView({ rows }) {
  return (
    <div
      className="diff-table diff-table--side-by-side"
      role="table"
      aria-label="Side-by-side diff"
    >
      {rows.map((row, index) => (
        <div className={`diff-row diff-row--${row.type}`} role="row" key={index}>
          <div className={`diff-cell ${row.left ? '' : 'diff-cell--empty'}`} role="cell">
            <span className="diff-line-number">{row.left ? row.left.number : ''}</span>
            <span className="diff-line-content">
              <SideBySideCellContent line={row.left} row={row} side="left" />
            </span>
          </div>
          <div className={`diff-cell ${row.right ? '' : 'diff-cell--empty'}`} role="cell">
            <span className="diff-line-number">{row.right ? row.right.number : ''}</span>
            <span className="diff-line-content">
              <SideBySideCellContent line={row.right} row={row} side="right" />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Renders one row of the unified diff view as an ARIA row owning two cells
 * (the +/-/space marker and the line content).
 * @param {{variant: string, marker: string, children: React.ReactNode}} props
 * @returns {React.JSX.Element}
 */
function UnifiedRow({ variant, marker, children }) {
  return (
    <div className={`diff-row diff-row--${variant}`} role="row">
      <span className="diff-line-marker" role="cell">
        {marker}
      </span>
      <span className="diff-line-content" role="cell">
        {children}
      </span>
    </div>
  );
}

/**
 * Renders the single-column unified diff view.
 * @param {{rows: Array<object>}} props
 * @returns {React.JSX.Element}
 */
function UnifiedView({ rows }) {
  return (
    <div className="diff-table diff-table--unified" role="table" aria-label="Unified diff">
      {rows.map((row, index) => {
        if (row.type === 'unchanged') {
          return (
            <UnifiedRow variant="unchanged" marker=" " key={index}>
              {row.left.content}
            </UnifiedRow>
          );
        }
        if (row.type === 'modified') {
          return (
            <div className="diff-row-pair" role="rowgroup" key={index}>
              <UnifiedRow variant="removed" marker="-">
                <InlineTokens tokens={row.tokens} side="left" />
              </UnifiedRow>
              <UnifiedRow variant="added" marker="+">
                <InlineTokens tokens={row.tokens} side="right" />
              </UnifiedRow>
            </div>
          );
        }
        if (row.type === 'removed') {
          return (
            <UnifiedRow variant="removed" marker="-" key={index}>
              {row.left.content}
            </UnifiedRow>
          );
        }
        return (
          <UnifiedRow variant="added" marker="+" key={index}>
            {row.right.content}
          </UnifiedRow>
        );
      })}
    </div>
  );
}

/**
 * Renders the Text Diff tool: two editable panels, a Side-by-Side/Unified
 * diff view with inline word-level highlighting, change statistics, and
 * copy/download of the result as a unified diff.
 *
 * @param {{onBack?: () => void}} props
 * @returns {React.JSX.Element} The Text Diff tool UI.
 */
export default function DiffTool({ onBack }) {
  const [leftText, setLeftText] = useState('');
  const [rightText, setRightText] = useState('');
  const [viewMode, setViewMode] = useState(VIEW_MODES.SIDE_BY_SIDE);
  const [copied, setCopied] = useState(false);
  const [fileError, setFileError] = useState('');
  const leftFileInputRef = useRef(null);
  const rightFileInputRef = useRef(null);

  const { rows, stats, unifiedDiff: unifiedDiffText } = useMemo(
    () => computeTextDiff(leftText, rightText, { oldLabel: 'original', newLabel: 'modified' }),
    [leftText, rightText],
  );

  const hasChanges = stats.added + stats.removed + stats.modified > 0;

  function handleSwap() {
    setLeftText(rightText);
    setRightText(leftText);
  }

  function handleClear() {
    setLeftText('');
    setRightText('');
    setFileError('');
    if (leftFileInputRef.current) leftFileInputRef.current.value = '';
    if (rightFileInputRef.current) rightFileInputRef.current.value = '';
  }

  async function handleFileLoad(event, setText) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    try {
      const text = await readFileAsText(selected);
      setText(text);
      setFileError('');
    } catch (err) {
      setFileError(err.message);
    } finally {
      event.target.value = '';
    }
  }

  async function handleCopy() {
    if (!unifiedDiffText) return;
    try {
      await navigator.clipboard.writeText(unifiedDiffText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setFileError('Failed to copy the diff to clipboard.');
    }
  }

  function handleDownload() {
    if (!unifiedDiffText) return;
    const blob = new Blob([unifiedDiffText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'diff.patch';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <section className="diff-tool" aria-label="Text Diff Tool">
      <div className="tool-header-row">
        <div className="tool-title-group">
          <button className="back-button" onClick={onBack} aria-label="Go back to tool dashboard">
            <span>←</span> Back
          </button>
          <h2 className="tool-title">Text Diff</h2>
        </div>
      </div>

      <div className="diff-input-panels">
        <div className="panel">
          <div className="panel-label-row">
            <label className="panel-label" htmlFor="diff-left-input">
              Original
            </label>
            <label className="btn file-btn">
              Upload File
              <input
                ref={leftFileInputRef}
                type="file"
                className="file-input"
                onChange={(event) => handleFileLoad(event, setLeftText)}
                aria-label="Upload original file"
              />
            </label>
          </div>
          <textarea
            id="diff-left-input"
            className="panel-textarea"
            placeholder="Paste or type the original text…"
            value={leftText}
            onChange={(event) => setLeftText(event.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="panel">
          <div className="panel-label-row">
            <label className="panel-label" htmlFor="diff-right-input">
              Modified
            </label>
            <label className="btn file-btn">
              Upload File
              <input
                ref={rightFileInputRef}
                type="file"
                className="file-input"
                onChange={(event) => handleFileLoad(event, setRightText)}
                aria-label="Upload modified file"
              />
            </label>
          </div>
          <textarea
            id="diff-right-input"
            className="panel-textarea"
            placeholder="Paste or type the modified text…"
            value={rightText}
            onChange={(event) => setRightText(event.target.value)}
            spellCheck={false}
          />
        </div>
      </div>

      <div className="diff-toolbar">
        <div className="mode-toggle" role="group" aria-label="Diff view mode">
          <button
            type="button"
            aria-pressed={viewMode === VIEW_MODES.SIDE_BY_SIDE}
            className={`mode-btn ${viewMode === VIEW_MODES.SIDE_BY_SIDE ? 'active' : ''}`}
            onClick={() => setViewMode(VIEW_MODES.SIDE_BY_SIDE)}
          >
            Side-by-Side
          </button>
          <button
            type="button"
            aria-pressed={viewMode === VIEW_MODES.UNIFIED}
            className={`mode-btn ${viewMode === VIEW_MODES.UNIFIED ? 'active' : ''}`}
            onClick={() => setViewMode(VIEW_MODES.UNIFIED)}
          >
            Unified
          </button>
        </div>

        <div className="diff-stats" aria-label="Diff statistics">
          <span className="diff-stat diff-stat--added">+{stats.added}</span>
          <span className="diff-stat diff-stat--removed">-{stats.removed}</span>
          <span className="diff-stat diff-stat--modified">~{stats.modified}</span>
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className="btn"
            onClick={handleSwap}
            disabled={!leftText && !rightText}
          >
            ⇅ Swap
          </button>
          <button type="button" className="btn" onClick={handleCopy} disabled={!hasChanges}>
            {copied ? '✓ Copied' : 'Copy Diff'}
          </button>
          <button type="button" className="btn" onClick={handleDownload} disabled={!hasChanges}>
            Download
          </button>
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      {fileError && (
        <div className="diff-error" role="alert">
          ⚠ {fileError}
        </div>
      )}

      <div className="diff-view">
        {!hasChanges ? (
          <p className="diff-empty-state">
            {leftText || rightText
              ? 'No differences found.'
              : 'Paste text on both sides to see a diff.'}
          </p>
        ) : viewMode === VIEW_MODES.SIDE_BY_SIDE ? (
          <SideBySideView rows={rows} />
        ) : (
          <UnifiedView rows={rows} />
        )}
      </div>
    </section>
  );
}
