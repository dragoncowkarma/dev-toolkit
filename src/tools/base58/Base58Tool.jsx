import { useEffect, useRef, useState } from 'react';
import {
  decodeBase58CheckDetails,
  decodeBase58Details,
  encodeToBase58,
  encodeToBase58Check,
  fileToBase58,
  formatFileSize,
  MAX_FILE_SIZE,
} from './base58.utils.js';
import './base58.css';

const MODES = {
  ENCODE: 'encode',
  DECODE: 'decode',
};

const ALGORITHMS = {
  PLAIN: 'plain',
  CHECK: 'check',
};

const FORMATS = {
  TEXT: 'text',
  HEX: 'hex',
};

/**
 * Base58 / Base58Check Encoder/Decoder component.
 *
 * @returns {React.JSX.Element} The Base58 tool UI.
 */
export default function Base58Tool() {
  const [mode, setMode] = useState(MODES.ENCODE);
  const [algorithm, setAlgorithm] = useState(ALGORITHMS.PLAIN);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [inputType, setInputType] = useState(FORMATS.TEXT);
  const [outputType, setOutputType] = useState(FORMATS.TEXT);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState('info');
  const [outputIsHex, setOutputIsHex] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [file, setFile] = useState(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (file) return;
    if (input === '') {
      setOutput('');
      setError('');
      setNotice('');
      setNoticeType('info');
      setOutputIsHex(false);
      return;
    }

    let cancelled = false;

    const processInput = async () => {
      try {
        if (mode === MODES.ENCODE) {
          if (algorithm === ALGORITHMS.CHECK) {
            const result = await encodeToBase58Check(input, { inputType });
            if (!cancelled) {
              setOutput(result);
              setOutputIsHex(false);
              setError('');
              setNotice('');
              setNoticeType('info');
            }
          } else {
            const result = encodeToBase58(input, { inputType });
            if (!cancelled) {
              setOutput(result);
              setOutputIsHex(false);
              setError('');
              setNotice('');
              setNoticeType('info');
            }
          }
        } else {
          if (algorithm === ALGORITHMS.CHECK) {
            const details = await decodeBase58CheckDetails(input);
            if (cancelled) return;

            if (!details.checksumValid) {
              const isHex = outputType === FORMATS.HEX || !details.isUtf8;
              setOutput(isHex ? details.hex : (details.text ?? details.hex));
              setOutputIsHex(isHex);
              setError('');
              setNotice(
                `⚠ Checksum mismatch: ${
                  details.checksumError ?? 'Base58Check validation failed.'
                }`
              );
              setNoticeType('warning');
            } else if (outputType === FORMATS.HEX) {
              setOutput(details.hex);
              setOutputIsHex(true);
              setError('');
              setNotice('✓ Checksum valid.');
              setNoticeType('info');
            } else if (!details.isUtf8) {
              setOutput(details.hex);
              setOutputIsHex(true);
              setError('');
              setNotice(
                '✓ Checksum valid. Decoded data is binary (non-UTF-8). Displaying Hex view.'
              );
              setNoticeType('info');
            } else {
              setOutput(details.text ?? '');
              setOutputIsHex(false);
              setError('');
              setNotice('✓ Checksum valid.');
              setNoticeType('info');
            }
          } else {
            const details = decodeBase58Details(input);
            if (cancelled) return;

            if (outputType === FORMATS.HEX) {
              setOutput(details.hex);
              setOutputIsHex(true);
              setError('');
              setNotice('');
              setNoticeType('info');
            } else if (!details.isUtf8) {
              setOutput(details.hex);
              setOutputIsHex(true);
              setError('');
              setNotice('Decoded data is binary (non-UTF-8). Displaying Hex view.');
              setNoticeType('info');
            } else {
              setOutput(details.text ?? '');
              setOutputIsHex(false);
              setError('');
              setNotice('');
              setNoticeType('info');
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setOutput('');
          setOutputIsHex(false);
          setError(err.message);
          setNotice('');
          setNoticeType('info');
        }
      }
    };

    processInput();

    return () => {
      cancelled = true;
    };
  }, [input, mode, algorithm, inputType, outputType, file]);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;

    fileToBase58(file, { useChecksum: algorithm === ALGORITHMS.CHECK })
      .then((result) => {
        if (!cancelled) {
          setOutput(result);
          setOutputIsHex(false);
          setError('');
          setNotice('');
          setNoticeType('info');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOutput('');
          setOutputIsHex(false);
          setError(err.message);
          setNotice('');
          setNoticeType('info');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [file, algorithm]);

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
    setNotice('');
    setNoticeType('info');
  }

  function handleAlgorithmChange(nextAlgo) {
    if (nextAlgo === algorithm) return;
    setAlgorithm(nextAlgo);
    setError('');
    setNotice('');
    setNoticeType('info');
  }

  function handleInputChange(event) {
    setFile(null);
    setNotice('');
    setNoticeType('info');
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
      setInputType(outputIsHex ? FORMATS.HEX : FORMATS.TEXT);
    }
    setError('');
    setNotice('');
    setNoticeType('info');
  }

  function handleClear() {
    setInput('');
    setOutput('');
    setError('');
    setNotice('');
    setNoticeType('info');
    setOutputIsHex(false);
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
    if (selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setInput('');
      setOutput('');
      setError(
        'File is too large for Base58 (max 16 KB). ' +
          'Base58 is intended for short payloads such as addresses and keys.'
      );
      setNotice('');
      setNoticeType('info');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }
    setMode(MODES.ENCODE);
    setInputType(FORMATS.TEXT);
    setFile(selected);
    setInput(`📁 ${selected.name} (${formatFileSize(selected.size)})`);
    setOutput('');
    setError('');
    setNotice('');
    setNoticeType('info');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const alertMessage = error || copyError;

  return (
    <section className="base58-tool" aria-label="Base58 Encoder/Decoder Tool">
      <div className="base58-toolbar">
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

          <div
            className="option-toggle"
            role="group"
            aria-label="Base58 variant"
          >
            <button
              type="button"
              aria-pressed={algorithm === ALGORITHMS.PLAIN}
              className={`opt-btn ${
                algorithm === ALGORITHMS.PLAIN ? 'active' : ''
              }`}
              onClick={() => handleAlgorithmChange(ALGORITHMS.PLAIN)}
            >
              Base58
            </button>
            <button
              type="button"
              aria-pressed={algorithm === ALGORITHMS.CHECK}
              className={`opt-btn ${
                algorithm === ALGORITHMS.CHECK ? 'active' : ''
              }`}
              onClick={() => handleAlgorithmChange(ALGORITHMS.CHECK)}
            >
              Base58Check
            </button>
          </div>

          {mode === MODES.ENCODE && !file && (
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
              aria-label="Convert a file to Base58"
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

      <div className="base58-panels">
        <div className="panel">
          <label className="panel-label" htmlFor="base58-input">
            {mode === MODES.ENCODE
              ? !file && inputType === FORMATS.HEX
                ? 'Hex Bytes'
                : 'Text'
              : algorithm === ALGORITHMS.CHECK
                ? 'Base58Check'
                : 'Base58'}
          </label>
          <textarea
            id="base58-input"
            className="panel-textarea"
            placeholder={
              mode === MODES.ENCODE
                ? inputType === FORMATS.HEX
                  ? 'Type or paste hex bytes (e.g. 00 62 e9)…'
                  : 'Type or paste text to encode…'
                : algorithm === ALGORITHMS.CHECK
                  ? 'Paste Base58Check (e.g. Bitcoin address) to decode…'
                  : 'Paste Base58 to decode…'
            }
            value={input}
            onChange={handleInputChange}
            spellCheck={false}
          />
        </div>

        <div className="panel">
          <div className="panel-label-row">
            <label className="panel-label" htmlFor="base58-output">
              {mode === MODES.ENCODE
                ? algorithm === ALGORITHMS.CHECK
                  ? 'Base58Check'
                  : 'Base58'
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
            {copied && (
              <div className="sr-only" role="status">
                Copied to clipboard
              </div>
            )}
          </div>
          <textarea
            id="base58-output"
            className="panel-textarea"
            value={output}
            readOnly
            placeholder="Result will appear here…"
            spellCheck={false}
          />
        </div>
      </div>

      {alertMessage ? (
        <div className="base58-error" role="alert">
          ⚠ {alertMessage}
        </div>
      ) : notice ? (
        <div
          className={noticeType === 'warning' ? 'base58-warning' : 'base58-notice'}
          role="status"
          aria-live="polite"
        >
          {notice}
        </div>
      ) : null}
    </section>
  );
}
