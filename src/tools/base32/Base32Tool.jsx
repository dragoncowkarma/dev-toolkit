import { useEffect, useRef, useState } from 'react';
import {
  decodeBase32Details,
  encodeToBase32,
  fileToBase32,
  formatFileSize,
} from './base32.utils.js';
import './base32.css';

const MODES = {
  ENCODE: 'encode',
  DECODE: 'decode',
};

const FORMATS = {
  TEXT: 'text',
  HEX: 'hex',
};

/**
 * Base32 Encoder/Decoder component with padding options and Hex/Text view support.
 *
 * @returns {React.JSX.Element} The Base32 tool UI.
 */
export default function Base32Tool() {
  const [mode, setMode] = useState(MODES.ENCODE);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [padded, setPadded] = useState(true);
  const [inputType, setInputType] = useState(FORMATS.TEXT);
  const [outputType, setOutputType] = useState(FORMATS.TEXT);
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [file, setFile] = useState(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (file) return;
    if (input === '') {
      setOutput('');
      setError('');
      return;
    }
    try {
      if (mode === MODES.ENCODE) {
        const result = encodeToBase32(input, { padded, inputType });
        setOutput(result);
        setError('');
      } else {
        const details = decodeBase32Details(input);
        if (outputType === FORMATS.HEX) {
          setOutput(details.hex);
          setError('');
        } else if (!details.isUtf8) {
          setOutput(details.hex);
          setError('Decoded data is binary (non-UTF-8). Displaying Hex view.');
        } else {
          setOutput(details.text ?? '');
          setError('');
        }
      }
    } catch (err) {
      setOutput('');
      setError(err.message);
    }
  }, [input, mode, padded, inputType, outputType, file]);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    fileToBase32(file, { padded })
      .then((result) => {
        if (!cancelled) {
          setOutput(result);
          setError('');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOutput('');
          setError(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [file, padded]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    if (file) {
      setFile(null);
      setInput('');
      setOutput('');
    }
    setError('');
  }

  function handleInputChange(event) {
    setFile(null);
    setInput(event.target.value);
  }

  function handleSwap() {
    if (error || !output) return;
    setFile(null);
    setInput(output);
    const nextMode = mode === MODES.ENCODE ? MODES.DECODE : MODES.ENCODE;
    setMode(nextMode);

    if (nextMode === MODES.DECODE) {
      setOutputType(FORMATS.TEXT);
    } else {
      setInputType(outputType === FORMATS.HEX ? FORMATS.HEX : FORMATS.TEXT);
    }
  }

  function handleClear() {
    setInput('');
    setOutput('');
    setError('');
    setCopyError('');
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

  function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setMode(MODES.ENCODE);
    setInputType(FORMATS.TEXT);
    setFile(selected);
    setInput(`📁 ${selected.name} (${formatFileSize(selected.size)})`);
    setOutput('');
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const alertMessage = error || copyError;

  return (
    <section className="base32-tool" aria-label="Base32 Encoder/Decoder Tool">
      <div className="base32-toolbar">
        <div className="toolbar-group">
          <div
            className="mode-toggle"
            role="group"
            aria-label="Conversion mode"
          >
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

          {mode === MODES.ENCODE && (
            <>
              <div
                className="option-toggle"
                role="group"
                aria-label="Padding option"
              >
                <button
                  type="button"
                  aria-pressed={padded}
                  className={`opt-btn ${padded ? 'active' : ''}`}
                  onClick={() => setPadded(true)}
                >
                  Padded (=)
                </button>
                <button
                  type="button"
                  aria-pressed={!padded}
                  className={`opt-btn ${!padded ? 'active' : ''}`}
                  onClick={() => setPadded(false)}
                >
                  Unpadded
                </button>
              </div>

              {!file && (
                <div
                  className="option-toggle"
                  role="group"
                  aria-label="Input format"
                >
                  <button
                    type="button"
                    aria-pressed={inputType === FORMATS.TEXT}
                    className={`opt-btn ${
                      inputType === FORMATS.TEXT ? 'active' : ''
                    }`}
                    onClick={() => setInputType(FORMATS.TEXT)}
                  >
                    Text
                  </button>
                  <button
                    type="button"
                    aria-pressed={inputType === FORMATS.HEX}
                    className={`opt-btn ${
                      inputType === FORMATS.HEX ? 'active' : ''
                    }`}
                    onClick={() => setInputType(FORMATS.HEX)}
                  >
                    Hex
                  </button>
                </div>
              )}
            </>
          )}

          {mode === MODES.DECODE && (
            <div
              className="option-toggle"
              role="group"
              aria-label="Output format"
            >
              <button
                type="button"
                aria-pressed={outputType === FORMATS.TEXT}
                className={`opt-btn ${
                  outputType === FORMATS.TEXT ? 'active' : ''
                }`}
                onClick={() => setOutputType(FORMATS.TEXT)}
              >
                Text
              </button>
              <button
                type="button"
                aria-pressed={outputType === FORMATS.HEX}
                className={`opt-btn ${
                  outputType === FORMATS.HEX ? 'active' : ''
                }`}
                onClick={() => setOutputType(FORMATS.HEX)}
              >
                Hex
              </button>
            </div>
          )}
        </div>

        <div className="toolbar-actions">
          <label className="btn file-btn">
            Upload File
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              onChange={handleFileChange}
              aria-label="Convert a file to Base32"
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={handleSwap}
            disabled={!output || !!error}
          >
            ⇅ Swap
          </button>
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="base32-panels">
        <div className="panel">
          <label className="panel-label" htmlFor="base32-input">
            {mode === MODES.ENCODE
              ? (!file && inputType === FORMATS.HEX)
                ? 'Hex Bytes'
                : 'Text'
              : 'Base32'}
          </label>
          <textarea
            id="base32-input"
            className="panel-textarea"
            placeholder={
              mode === MODES.ENCODE
                ? inputType === FORMATS.HEX
                  ? 'Type or paste hex bytes (e.g. 66 6f 6f)…'
                  : 'Type or paste text to encode…'
                : 'Paste Base32 to decode…'
            }
            value={input}
            onChange={handleInputChange}
            spellCheck={false}
          />
        </div>

        <div className="panel">
          <div className="panel-label-row">
            <label className="panel-label" htmlFor="base32-output">
              {mode === MODES.ENCODE
                ? 'Base32'
                : outputType === FORMATS.HEX
                  ? 'Hex Bytes'
                  : 'Text'}
            </label>
            <button
              type="button"
              className="btn copy-btn"
              onClick={handleCopy}
              disabled={!output}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <div className="sr-only" role="status">
              {copied ? 'Copied to clipboard' : ''}
            </div>
          </div>
          <textarea
            id="base32-output"
            className="panel-textarea"
            value={output}
            readOnly
            placeholder="Result will appear here…"
            spellCheck={false}
          />
        </div>
      </div>

      {alertMessage && (
        <div className="base32-error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}
    </section>
  );
}
