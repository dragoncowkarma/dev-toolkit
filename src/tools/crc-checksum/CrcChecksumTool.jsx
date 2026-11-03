import { useMemo, useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import {
  checksumAlgorithms,
  formatHex,
  inputToBytes,
} from './crcChecksum.utils.js';
import './crc-checksum.css';

const SAMPLE_TEXT = '123456789';

/**
 * Renders a client-side checksum calculator for text and hexadecimal byte input.
 * @returns {React.JSX.Element} The checksum calculator UI.
 */
export default function CrcChecksumTool() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('text');
  const [selected, setSelected] = useState(() => new Set(checksumAlgorithms.map(({ id }) => id)));
  const [copyError, setCopyError] = useState('');
  const [copiedId, showCopied] = useCopyFeedback({ initialValue: '', resetValue: '' });

  const calculation = useMemo(() => {
    try {
      const bytes = inputToBytes(input, mode);
      return {
        error: '',
        results: checksumAlgorithms
          .filter(({ id }) => selected.has(id))
          .map((algorithm) => ({
            ...algorithm,
            value: formatHex(algorithm.calculate(bytes), algorithm.width),
          })),
      };
    } catch (error) {
      return { error: error.message, results: [] };
    }
  }, [input, mode, selected]);

  function toggleAlgorithm(id) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function loadSample() {
    setMode('text');
    setInput(SAMPLE_TEXT);
    setCopyError('');
  }

  async function copyResult(id, value) {
    try {
      await navigator.clipboard.writeText(value);
      showCopied(id);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy checksum to clipboard.');
    }
  }

  const alertMessage = calculation.error || copyError;

  return (
    <section className="crc-checksum-tool" aria-label="CRC checksum calculator">
      <div className="crc-checksum-toolbar">
        <fieldset className="crc-checksum-mode">
          <legend>Input format</legend>
          <label>
            <input type="radio" name="crc-mode" value="text" checked={mode === 'text'}
              onChange={() => setMode('text')} /> Text (UTF-8)
          </label>
          <label>
            <input type="radio" name="crc-mode" value="hex" checked={mode === 'hex'}
              onChange={() => setMode('hex')} /> Hex bytes
          </label>
        </fieldset>
        <button type="button" className="crc-checksum-button" onClick={loadSample}>
          Load 123456789 sample
        </button>
      </div>

      <label className="crc-checksum-label" htmlFor="crc-checksum-input">
        {mode === 'text' ? 'Text input' : 'Hexadecimal bytes'}
      </label>
      <textarea
        id="crc-checksum-input"
        className="crc-checksum-input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={mode === 'text' ? 'Type or paste UTF-8 text…' : 'Example: 31 32 33'}
        spellCheck={false}
      />

      <fieldset className="crc-checksum-algorithms">
        <legend>Algorithms</legend>
        {checksumAlgorithms.map(({ id, label }) => (
          <label key={id}>
            <input type="checkbox" checked={selected.has(id)}
              onChange={() => toggleAlgorithm(id)} />
            {label}
          </label>
        ))}
      </fieldset>

      {alertMessage && <div className="crc-checksum-alert" role="alert">{alertMessage}</div>}

      {!calculation.error && (
        <div className="crc-checksum-results" aria-label="Checksum results">
          {calculation.results.map(({ id, label, value }) => (
            <article className="crc-checksum-result" key={id}>
              <span>{label}</span>
              <output aria-label={`${label} result`}>{value}</output>
              <button type="button" className="crc-checksum-button"
                onClick={() => copyResult(id, value)}>
                {copiedId === id ? 'Copied' : 'Copy'}
              </button>
            </article>
          ))}
          {calculation.results.length === 0 && <p>Select at least one algorithm.</p>}
        </div>
      )}
    </section>
  );
}
