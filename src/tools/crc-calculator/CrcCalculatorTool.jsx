import { useEffect, useRef, useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import {
  crc8,
  crc16,
  crc32,
  fileToBytes,
  formatChecksum,
  formatFileSize,
  textToBytes,
} from './crc.utils.js';
import './crc-calculator.css';

const ALGORITHMS = [
  { id: 'crc8', label: 'CRC-8', calculate: crc8, width: 2 },
  { id: 'crc16', label: 'CRC-16/CCITT-FALSE', calculate: crc16, width: 4 },
  { id: 'crc32', label: 'CRC-32', calculate: crc32, width: 8 },
];

/**
 * Renders a client-side calculator for CRC-8, CRC-16, and CRC-32 checksums.
 * @returns {React.JSX.Element}
 */
export default function CrcCalculatorTool() {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [fileBytes, setFileBytes] = useState(null);
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copiedValue, showCopied] = useCopyFeedback({ initialValue: '', resetValue: '' });
  const fileInputRef = useRef(null);
  const requestRef = useRef(0);

  const bytes = fileBytes ?? textToBytes(text);
  const hasInput = fileBytes !== null || text !== '';
  const results = hasInput
    ? ALGORITHMS.map((algorithm) => ({
        ...algorithm,
        value: formatChecksum(algorithm.calculate(bytes), algorithm.width),
      }))
    : [];

  useEffect(() => {
    setCopyError('');
  }, [text, fileBytes]);

  function handleTextChange(event) {
    requestRef.current += 1;
    setFile(null);
    setFileBytes(null);
    setText(event.target.value);
    setError('');
  }

  function handleClear() {
    requestRef.current += 1;
    setText('');
    setFile(null);
    setFileBytes(null);
    setError('');
    setCopyError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const requestId = (requestRef.current += 1);
    try {
      const selectedBytes = await fileToBytes(selected);
      if (requestRef.current !== requestId) return;
      setText('');
      setFile(selected);
      setFileBytes(selectedBytes);
      setError('');
    } catch (readError) {
      if (requestRef.current !== requestId) return;
      setError(readError.message);
      setFile(null);
      setFileBytes(null);
    }
  }

  async function handleCopy(value) {
    try {
      await navigator.clipboard.writeText(value);
      showCopied(value);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  const alertMessage = error || copyError;

  return (
    <section className="crc-calculator" aria-label="CRC Checksum Calculator">
      <div className="crc-calculator__toolbar">
        <label className="crc-calculator__button crc-calculator__file-button">
          Upload File
          <input
            ref={fileInputRef}
            type="file"
            className="crc-calculator__file-input"
            onChange={handleFileChange}
            aria-label="Choose a file to calculate checksums"
            aria-describedby={error ? 'crc-calculator-message' : undefined}
            aria-invalid={Boolean(error)}
          />
        </label>
        <button type="button" className="crc-calculator__button" onClick={handleClear}>
          Clear
        </button>
      </div>

      <div className="crc-calculator__input-group">
        <label className="crc-calculator__label" htmlFor="crc-calculator-input">
          Text input
        </label>
        <textarea
          id="crc-calculator-input"
          className="crc-calculator__textarea"
          value={text}
          onChange={handleTextChange}
          placeholder="Type or paste text to calculate checksums…"
          aria-describedby={error ? 'crc-calculator-message' : undefined}
          aria-invalid={Boolean(error)}
          spellCheck={false}
        />
        {file && (
          <p className="crc-calculator__file-name">
            File: {file.name} ({formatFileSize(file.size)})
          </p>
        )}
      </div>

      <div className="crc-calculator__results" aria-label="Checksum results">
        {ALGORITHMS.map((algorithm) => {
          const result = results.find(({ id }) => id === algorithm.id);
          const value = result?.value ?? '—';
          const isCopied = copiedValue === value;
          return (
            <div className="crc-calculator__result" key={algorithm.id}>
              <div>
                <h2 className="crc-calculator__result-name">{algorithm.label}</h2>
                <output className="crc-calculator__value">{value}</output>
              </div>
              <button
                type="button"
                className="crc-calculator__button"
                onClick={() => handleCopy(value)}
                disabled={!result}
              >
                {isCopied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          );
        })}
      </div>

      {copiedValue && (
        <div className="sr-only" role="status" aria-live="polite">
          Checksum copied to clipboard.
        </div>
      )}
      {alertMessage && (
        <div id="crc-calculator-message" className="crc-calculator__error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}
    </section>
  );
}
