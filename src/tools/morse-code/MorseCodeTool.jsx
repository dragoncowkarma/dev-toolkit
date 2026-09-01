import { useEffect, useMemo, useState } from 'react';
import { decodeFromMorse, encodeToMorse, looksLikeMorse } from './morse.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './morse-code.css';

const MODES = {
  AUTO: 'auto',
  ENCODE: 'encode',
  DECODE: 'decode',
};

/**
 * Renders the Morse Code encoder/decoder tool with live conversion and
 * auto-detection of the conversion direction.
 *
 * @returns {React.JSX.Element} The Morse Code tool UI.
 */
export default function MorseCodeTool() {
  const [mode, setMode] = useState(MODES.AUTO);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });

  // In auto mode, direction is inferred from the input's shape; otherwise it
  // follows the user's manual toggle.
  const direction = useMemo(() => {
    if (mode !== MODES.AUTO) return mode;
    return looksLikeMorse(input) ? MODES.DECODE : MODES.ENCODE;
  }, [mode, input]);

  // Real-time conversion whenever the input or effective direction changes.
  useEffect(() => {
    if (input === '') {
      setOutput('');
      setError('');
      return;
    }
    try {
      const result =
        direction === MODES.ENCODE ? encodeToMorse(input) : decodeFromMorse(input);
      setOutput(result);
      setError('');
    } catch (err) {
      setOutput('');
      setError(err.message);
    }
  }, [input, direction]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setError('');
  }

  function handleInputChange(event) {
    setInput(event.target.value);
  }

  function handleSwap() {
    if (error || !output) return;
    setInput(output);
    if (mode !== MODES.AUTO) {
      setMode(mode === MODES.ENCODE ? MODES.DECODE : MODES.ENCODE);
    }
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

  const alertMessage = error || copyError;
  const inputLabel = direction === MODES.ENCODE ? 'Text' : 'Morse Code';
  const outputLabel = direction === MODES.ENCODE ? 'Morse Code' : 'Text';

  return (
    <section className="morse-code-tool" aria-label="Morse Code Encoder/Decoder Tool">
      <div className="morse-code-toolbar">
        <div className="mode-toggle" role="group" aria-label="Conversion mode">
          <button
            type="button"
            aria-pressed={mode === MODES.AUTO}
            className={`mode-btn ${mode === MODES.AUTO ? 'active' : ''}`}
            onClick={() => handleModeChange(MODES.AUTO)}
          >
            Auto
          </button>
          <button
            type="button"
            aria-pressed={mode === MODES.ENCODE}
            className={`mode-btn ${mode === MODES.ENCODE ? 'active' : ''}`}
            onClick={() => handleModeChange(MODES.ENCODE)}
          >
            Encode
          </button>
          <button
            type="button"
            aria-pressed={mode === MODES.DECODE}
            className={`mode-btn ${mode === MODES.DECODE ? 'active' : ''}`}
            onClick={() => handleModeChange(MODES.DECODE)}
          >
            Decode
          </button>
        </div>

        <div className="toolbar-actions">
          <button type="button" className="btn" onClick={handleSwap} disabled={!output || !!error}>
            ⇅ Swap
          </button>
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="morse-code-panels">
        <div className="panel">
          <label className="panel-label" htmlFor="morse-code-input">
            {inputLabel}
          </label>
          <textarea
            id="morse-code-input"
            className="panel-textarea"
            placeholder={
              direction === MODES.ENCODE
                ? 'Type or paste text to encode…'
                : 'Paste Morse code to decode (use . and - with / or spaces between words)…'
            }
            value={input}
            onChange={handleInputChange}
            spellCheck={false}
          />
        </div>

        <div className="panel">
          <div className="panel-label-row">
            <label className="panel-label" htmlFor="morse-code-output">
              {outputLabel}
            </label>
            <button
              type="button"
              className="btn copy-btn"
              onClick={handleCopy}
              disabled={!output}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            {copied && (
              <div className="sr-only" role="status" aria-live="polite">
                Copied to clipboard
              </div>
            )}
          </div>
          <textarea
            id="morse-code-output"
            className="panel-textarea"
            value={output}
            readOnly
            placeholder="Result will appear here…"
            spellCheck={false}
          />
        </div>
      </div>

      {alertMessage && (
        <div className="morse-code-error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}
    </section>
  );
}
