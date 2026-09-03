import { useEffect, useState } from 'react';
import { decodeBase62, encodeBase62 } from './base62.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './base62.css';

const MODES = { ENCODE: 'encode', DECODE: 'decode' };

/**
 * Renders a BigInt-safe client-side Base62 encoder and decoder.
 * @returns {React.JSX.Element} The Base62 tool UI.
 */
export default function Base62Tool() {
  const [mode, setMode] = useState(MODES.ENCODE);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });

  useEffect(() => {
    if (input === '') {
      setOutput('');
      setError('');
      return;
    }

    try {
      setOutput(mode === MODES.ENCODE ? encodeBase62(input) : decodeBase62(input));
      setError('');
    } catch (conversionError) {
      setOutput('');
      setError(conversionError.message);
    }
  }, [input, mode]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setInput(output);
    setOutput('');
    setError('');
    setCopyError('');
  }

  function handleSwap() {
    if (!output || error) return;
    handleModeChange(mode === MODES.ENCODE ? MODES.DECODE : MODES.ENCODE);
  }

  function handleClear() {
    setInput('');
    setOutput('');
    setError('');
    setCopyError('');
  }

  async function handleCopy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  const isEncoding = mode === MODES.ENCODE;
  const errorId = 'base62-error';
  const alertMessage = error || copyError;

  return (
    <section className="base62-tool" aria-label="Base62 Encoder/Decoder Tool">
      <div className="base62-toolbar">
        <div className="base62-mode-toggle" role="group" aria-label="Conversion mode">
          <button
            type="button"
            className={`base62-mode-button ${isEncoding ? 'active' : ''}`}
            aria-pressed={isEncoding}
            onClick={() => handleModeChange(MODES.ENCODE)}
          >
            Decimal to Base62
          </button>
          <button
            type="button"
            className={`base62-mode-button ${!isEncoding ? 'active' : ''}`}
            aria-pressed={!isEncoding}
            onClick={() => handleModeChange(MODES.DECODE)}
          >
            Base62 to Decimal
          </button>
        </div>
        <div className="base62-actions">
          <button
            type="button"
            className="base62-button"
            onClick={handleSwap}
            disabled={!output || !!error}
          >
            ⇅ Swap
          </button>
          <button type="button" className="base62-button" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="base62-panels">
        <div className="base62-panel">
          <label className="base62-label" htmlFor="base62-input">
            {isEncoding ? 'Decimal' : 'Base62'}
          </label>
          <textarea
            id="base62-input"
            className="base62-textarea"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              isEncoding ? 'Enter a non-negative integer…' : 'Enter a Base62 value…'
            }
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            spellCheck={false}
          />
        </div>
        <div className="base62-panel">
          <div className="base62-output-heading">
            <label className="base62-label" htmlFor="base62-output">
              {isEncoding ? 'Base62' : 'Decimal'}
            </label>
            <button
              type="button"
              className="base62-button base62-copy-button"
              onClick={handleCopy}
              disabled={!output}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <textarea
            id="base62-output"
            className="base62-textarea"
            value={output}
            readOnly
            placeholder="Result will appear here…"
            spellCheck={false}
          />
        </div>
      </div>

      {copied && (
        <div className="sr-only" role="status" aria-live="polite">
          Copied to clipboard.
        </div>
      )}
      {alertMessage && (
        <div id={errorId} className="base62-error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}
    </section>
  );
}
