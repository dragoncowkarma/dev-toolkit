import { useEffect, useState } from 'react';
import { toASCII, toUnicode } from './punycode.utils.js';
import './punycode.css';

const MODES = {
  ENCODE: 'encode', // Unicode → ASCII
  DECODE: 'decode', // ASCII → Unicode
};

/**
 * Renders the Punycode / IDN Converter tool UI with bidirectional conversion,
 * IDNA validation, and homograph risk inspection.
 *
 * @returns {React.JSX.Element} The Punycode converter tool component.
 */
export default function PunycodeTool() {
  const [mode, setMode] = useState(MODES.ENCODE);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [labels, setLabels] = useState([]);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');

  useEffect(() => {
    if (!input || input.trim() === '') {
      setOutput('');
      setErrors([]);
      setWarnings([]);
      setLabels([]);
      return;
    }

    const result = mode === MODES.ENCODE ? toASCII(input.trim()) : toUnicode(input.trim());

    setErrors(result.errors);
    setWarnings(result.warnings);
    setLabels(result.labels);

    if (result.errors.length > 0) {
      setOutput('');
    } else {
      setOutput(mode === MODES.ENCODE ? result.ascii : result.unicode);
    }
  }, [input, mode]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setErrors([]);
    setWarnings([]);
    setCopyError('');
  }

  function handleInputChange(event) {
    setInput(event.target.value);
  }

  function handleSwap() {
    if (errors.length > 0 || !output) return;
    setInput(output);
    setMode(mode === MODES.ENCODE ? MODES.DECODE : MODES.ENCODE);
  }

  function handleClear() {
    setInput('');
    setOutput('');
    setErrors([]);
    setWarnings([]);
    setLabels([]);
    setCopyError('');
  }

  async function handleCopy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  const alertMessage = errors.length > 0 ? errors.join(' ') : copyError;

  return (
    <section className="punycode-tool" aria-label="Punycode and IDN Converter Tool">
      <div className="punycode-toolbar">
        <div className="mode-toggle" role="group" aria-label="Conversion mode">
          <button
            type="button"
            aria-pressed={mode === MODES.ENCODE}
            className={`mode-btn ${mode === MODES.ENCODE ? 'active' : ''}`}
            onClick={() => handleModeChange(MODES.ENCODE)}
          >
            Unicode → ASCII (Encode)
          </button>
          <button
            type="button"
            aria-pressed={mode === MODES.DECODE}
            className={`mode-btn ${mode === MODES.DECODE ? 'active' : ''}`}
            onClick={() => handleModeChange(MODES.DECODE)}
          >
            ASCII → Unicode (Decode)
          </button>
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className="btn"
            onClick={handleSwap}
            disabled={!output || errors.length > 0}
          >
            ⇅ Swap
          </button>
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="punycode-panels">
        <div className="panel">
          <label className="panel-label" htmlFor="punycode-input">
            {mode === MODES.ENCODE ? 'Unicode Domain (IDN)' : 'ASCII Domain (Punycode / ACE)'}
          </label>
          <textarea
            id="punycode-input"
            className="panel-textarea"
            placeholder={
              mode === MODES.ENCODE
                ? 'e.g. münchen.example.한국 or аpple.com'
                : 'e.g. xn--mnchen-3ya.example.xn--3e0b707e'
            }
            value={input}
            onChange={handleInputChange}
            spellCheck={false}
          />
        </div>

        <div className="panel">
          <div className="panel-label-row">
            <label className="panel-label" htmlFor="punycode-output">
              {mode === MODES.ENCODE ? 'ASCII Domain (Punycode / ACE)' : 'Unicode Domain (IDN)'}
            </label>
            <button
              type="button"
              className="btn copy-btn"
              onClick={handleCopy}
              disabled={!output}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <textarea
            id="punycode-output"
            className="panel-textarea"
            value={output}
            readOnly
            placeholder="Conversion result will appear here…"
            spellCheck={false}
          />
        </div>
      </div>

      {alertMessage && (
        <div className="punycode-error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}

      {warnings.length > 0 && errors.length === 0 && (
        <div className="punycode-warning" role="status">
          ⚠ {warnings.join(' ')}
        </div>
      )}

      {labels.length > 0 && (
        <div className="label-breakdown">
          <div className="label-breakdown-header">
            <h3 className="label-breakdown-title">Label Breakdown & Security Diagnostics</h3>
          </div>

          <div className="label-breakdown-table-wrapper">
            <table className="label-breakdown-table">
              <thead>
                <tr>
                  <th scope="col">Original Label</th>
                  <th scope="col">Unicode Form</th>
                  <th scope="col">ASCII ACE Form</th>
                  <th scope="col">Encoded Length</th>
                  <th scope="col">Scripts</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {labels.map((label, idx) => (
                  <tr key={`${label.original}-${idx}`}>
                    <td>{label.original}</td>
                    <td>{label.unicode}</td>
                    <td>{label.ascii}</td>
                    <td>{label.asciiLength} / 63 bytes</td>
                    <td>
                      {label.scripts.length > 0
                        ? label.scripts.join(', ')
                        : 'ASCII / Neutral'}
                    </td>
                    <td>
                      {label.hasHomographRisk ? (
                        <span className="status-pill warning" title="Mixed scripts detected">
                          ⚠ Homograph Risk
                        </span>
                      ) : label.ascii.startsWith('xn--') ? (
                        <span className="status-pill encoded" title="Punycode ACE encoded">
                          ACE Encoded
                        </span>
                      ) : (
                        <span className="status-pill clean" title="Standard ASCII label">
                          ✓ ASCII
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
