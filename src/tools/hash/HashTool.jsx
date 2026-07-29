import { useEffect, useRef, useState } from 'react';
import {
  HASH_ALGORITHMS,
  HASH_FORMATS,
  hashData,
  hashText,
} from './hash.utils.js';
import './hash.css';

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Renders a live, multi-algorithm SHA hash generator for text and files.
 *
 * @returns {React.JSX.Element} The Hash Generator UI.
 */
export default function HashTool() {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [selectedAlgorithms, setSelectedAlgorithms] = useState(HASH_ALGORITHMS);
  const [format, setFormat] = useState(HASH_FORMATS.HEX);
  const [results, setResults] = useState({});
  const [isHashing, setIsHashing] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const fileInputRef = useRef(null);
  const hashRequestRef = useRef(0);
  const copyTimerRef = useRef(null);

  useEffect(() => {
    const requestId = (hashRequestRef.current += 1);
    let isActive = true;

    if (selectedAlgorithms.length === 0 || (!file && text === '')) {
      setResults({});
      setIsHashing(false);
      setError('');
      return () => {
        isActive = false;
      };
    }

    setIsHashing(true);
    setError('');

    const createHashes = async () => {
      const fileContents = file ? await file.arrayBuffer() : null;
      const entries = await Promise.all(
        selectedAlgorithms.map(async (algorithm) => {
          const result = file
            ? await hashData(fileContents, algorithm, format)
            : await hashText(text, algorithm, format);
          return [algorithm, result];
        })
      );

      if (!isActive || hashRequestRef.current !== requestId) {
        return;
      }
      setResults(Object.fromEntries(entries));
      setIsHashing(false);
    };

    createHashes().catch(() => {
      if (!isActive || hashRequestRef.current !== requestId) {
        return;
      }
      setResults({});
      setIsHashing(false);
      setError('Unable to generate hashes. Please try a different input.');
    });

    return () => {
      isActive = false;
    };
  }, [file, format, selectedAlgorithms, text]);

  useEffect(
    () => () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    },
    []
  );

  function handleTextChange(event) {
    setText(event.target.value);
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }
    setText('');
    setFile(selectedFile);
  }

  function handleClear() {
    setText('');
    setFile(null);
    setResults({});
    setError('');
    setCopyStatus('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function toggleAlgorithm(algorithm) {
    setSelectedAlgorithms((current) =>
      current.includes(algorithm)
        ? current.filter((item) => item !== algorithm)
        : HASH_ALGORITHMS.filter(
            (supportedAlgorithm) =>
              current.includes(supportedAlgorithm) || supportedAlgorithm === algorithm
          )
    );
  }

  async function handleCopy(algorithm) {
    const value = results[algorithm];
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(algorithm);
      setError('');
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => setCopyStatus(''), 1500);
    } catch {
      setError('Failed to copy the hash to the clipboard.');
    }
  }

  const sourceDescription = file
    ? `${file.name} (${formatFileSize(file.size)})`
    : 'Text input';

  return (
    <section className="hash-tool" aria-label="Hash Generator Tool">
      <div className="hash-tool__controls">
        <fieldset className="hash-tool__fieldset">
          <legend>Algorithms</legend>
          <div className="hash-tool__algorithm-list">
            {HASH_ALGORITHMS.map((algorithm) => (
              <label className="hash-tool__check" key={algorithm}>
                <input
                  type="checkbox"
                  checked={selectedAlgorithms.includes(algorithm)}
                  onChange={() => toggleAlgorithm(algorithm)}
                />
                <span>{algorithm}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="hash-tool__fieldset">
          <legend>Output format</legend>
          <div className="hash-tool__format-list">
            {Object.values(HASH_FORMATS).map((outputFormat) => (
              <label className="hash-tool__radio" key={outputFormat}>
                <input
                  type="radio"
                  name="hash-output-format"
                  value={outputFormat}
                  checked={format === outputFormat}
                  onChange={() => setFormat(outputFormat)}
                />
                <span>{outputFormat === HASH_FORMATS.HEX ? 'Hex' : 'Base64'}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="hash-tool__input-card">
        <div className="hash-tool__input-header">
          <div>
            <label htmlFor="hash-text-input">Input text</label>
            <p>Hashes update as you type.</p>
          </div>
          <div className="hash-tool__actions">
            <label className="hash-tool__button hash-tool__upload">
              Upload file
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                aria-label="Upload a file to hash"
              />
            </label>
            <button
              className="hash-tool__button"
              type="button"
              onClick={handleClear}
              disabled={!text && !file}
            >
              Clear
            </button>
          </div>
        </div>

        <textarea
          id="hash-text-input"
          value={text}
          onChange={handleTextChange}
          placeholder="Type or paste text to generate hashes…"
          spellCheck={false}
        />

        <div className="hash-tool__source" aria-live="polite">
          <span>{sourceDescription}</span>
          {file && (
            <span className="hash-tool__memory-note">
              Files are read into memory before hashing.
            </span>
          )}
        </div>
      </div>

      {selectedAlgorithms.length === 0 && (
        <p className="hash-tool__empty" role="status">
          Select at least one algorithm to generate a hash.
        </p>
      )}

      {error && (
        <div className="hash-tool__error" role="alert">
          ⚠ {error}
        </div>
      )}

      <div className="hash-tool__results" aria-busy={isHashing}>
        {selectedAlgorithms.map((algorithm) => (
          <article className="hash-result" key={algorithm}>
            <div className="hash-result__header">
              <div>
                <h2>{algorithm}</h2>
                <span>{format === HASH_FORMATS.HEX ? 'Hex' : 'Base64'}</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(algorithm)}
                disabled={!results[algorithm]}
                aria-label={`Copy ${algorithm} hash`}
              >
                {copyStatus === algorithm ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <output className="hash-result__value" aria-label={`${algorithm} result`}>
              {isHashing ? 'Generating…' : results[algorithm] || 'Enter text or upload a file.'}
            </output>
          </article>
        ))}
      </div>

      <p className="hash-tool__privacy">
        SHA processing happens locally in your browser. MD5 is not included because Web Crypto
        does not support it.
      </p>
    </section>
  );
}
