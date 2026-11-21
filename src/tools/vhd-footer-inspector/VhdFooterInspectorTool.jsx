import { useRef, useState } from 'react';
import {
  formatHexDump,
  hexToBytes,
  parseVhdFooter,
} from './vhd-footer.utils.js';
import './vhd-footer.css';

function formatBytes(value) {
  return `${value.toString()} bytes`;
}

function fieldsFor(footer) {
  return [
    ['Cookie', footer.cookie],
    ['Features', `0x${footer.features.toString(16).padStart(8, '0')}`],
    ['File format version', `0x${footer.fileFormatVersion.toString(16).padStart(8, '0')}`],
    ['Data offset', formatBytes(footer.dataOffset)],
    ['Timestamp', footer.timestampIso],
    ['Creator application', footer.creatorApplication || '—'],
    ['Creator version', `0x${footer.creatorVersion.toString(16).padStart(8, '0')}`],
    ['Creator host OS', footer.creatorHostOs || '—'],
    ['Original size', formatBytes(footer.originalSize)],
    ['Current size', formatBytes(footer.currentSize)],
    [
      'Disk geometry',
      `${footer.geometry.cylinders} cylinders / ${footer.geometry.heads} heads / ` +
        `${footer.geometry.sectorsPerTrack} sectors`,
    ],
    ['Disk type', `${footer.diskType} (${footer.diskTypeCode})`],
    ['Checksum', `0x${footer.checksum.toString(16).padStart(8, '0')}`],
    ['Unique ID', footer.uniqueId],
    ['Saved state', footer.savedState === 1 ? 'Saved' : 'Not saved'],
  ];
}

/**
 * Renders a browser-only inspector for classic VHD footer metadata.
 *
 * @returns {React.JSX.Element} The VHD footer inspector.
 */
export default function VhdFooterInspectorTool() {
  const [hexInput, setHexInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  function inspect(bytes) {
    const parsed = parseVhdFooter(bytes);
    if (!parsed.ok) {
      setResult(null);
      setError(parsed.error);
      return;
    }
    setResult(parsed);
    setError('');
  }

  function handleHexChange(event) {
    const nextValue = event.target.value;
    setHexInput(nextValue);
    if (!nextValue.trim()) {
      setResult(null);
      setError('');
      return;
    }
    try {
      inspect(hexToBytes(nextValue));
    } catch (inputError) {
      setResult(null);
      setError(inputError.message);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setHexInput('');
    try {
      inspect(new Uint8Array(await file.arrayBuffer()));
    } catch {
      setResult(null);
      setError('Failed to read the selected VHD file.');
    }
  }

  function handleClear() {
    setHexInput('');
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="vhd-footer-inspector" aria-label="VHD Footer Inspector">
      <div className="vhd-footer-inspector__actions">
        <label className="vhd-footer-inspector__file-button">
          Upload VHD
          <input
            ref={fileInputRef}
            type="file"
            className="vhd-footer-inspector__file-input"
            onChange={handleFileChange}
            aria-label="Upload a VHD file"
          />
        </label>
        <button type="button" className="vhd-footer-inspector__button" onClick={handleClear}>
          Clear
        </button>
      </div>

      <label className="vhd-footer-inspector__label" htmlFor="vhd-footer-hex">
        VHD bytes or footer hex
      </label>
      <textarea
        id="vhd-footer-hex"
        className="vhd-footer-inspector__input"
        value={hexInput}
        onChange={handleHexChange}
        placeholder="Paste a 512-byte VHD footer as hexadecimal bytes…"
        spellCheck={false}
      />

      {error && (
        <div className="vhd-footer-inspector__error" role="alert">
          ⚠ {error}
        </div>
      )}

      {result && (
        <>
          <p
            className={
              `vhd-footer-inspector__checksum ` +
                `${result.footer.checksumValid ? 'is-valid' : 'is-invalid'}`
            }
          >
            Checksum {result.footer.checksumValid ? 'valid' : 'invalid'}
            {!result.footer.checksumValid && ' — the footer may be corrupt.'}
          </p>
          <div className="vhd-footer-inspector__table-wrap">
            <table>
              <caption>VHD footer at byte {result.footer.offset}</caption>
              <tbody>
                {fieldsFor(result.footer).map(([label, value]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3>Raw footer hex</h3>
            <pre className="vhd-footer-inspector__hex">{formatHexDump(result.rawFooter)}</pre>
          </div>
        </>
      )}
    </section>
  );
}
