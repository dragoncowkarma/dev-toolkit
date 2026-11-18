import { useRef, useState } from 'react';
import { formatHex, parseElf } from './elf-header-inspector.utils.js';
import './elf-header-inspector.css';

function displayValue(value) {
  return typeof value === 'bigint' ? formatHex(value) : String(value);
}

function FieldTable({ title, values }) {
  return (
    <section className="elf-table-section">
      <h3>{title}</h3>
      <table className="elf-field-table">
        <tbody>
          {Object.entries(values).map(([name, value]) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              <td>{displayValue(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function HeaderTable({ title, rows, columns, emptyMessage }) {
  return (
    <section className="elf-table-section">
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="elf-empty">{emptyMessage}</p> : (
        <div className="elf-scroll-table">
          <table className="elf-data-table">
            <thead>
              <tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {columns.map(([key]) => <td key={key}>{displayValue(row[key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function decodeBase64(value) {
  const cleaned = value.replace(/\s/g, '');
  if (!cleaned) throw new Error('Paste Base64-encoded ELF bytes or upload an ELF file.');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
    throw new Error('Pasted data must be valid Base64-encoded ELF bytes.');
  }
  const binary = atob(cleaned);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/**
 * Renders a client-side ELF header, segment, and section inspector.
 * @returns {React.JSX.Element} The ELF inspector tool.
 */
export default function ElfHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [paste, setPaste] = useState('');
  const fileInputRef = useRef(null);

  function inspect(bytes) {
    try {
      setResult(parseElf(bytes));
      setError('');
    } catch (caught) {
      setResult(null);
      setError(caught.message);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      inspect(new Uint8Array(await file.arrayBuffer()));
    } catch {
      setResult(null);
      setError('File read failed. Please select the ELF file again.');
    }
  }

  function handlePasteInspect() {
    try {
      inspect(decodeBase64(paste));
    } catch (caught) {
      setResult(null);
      setError(caught.message);
    }
  }

  function handleClear() {
    setResult(null);
    setError('');
    setPaste('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="elf-inspector" aria-label="ELF Header Inspector">
      <div className="elf-controls">
        <label className="elf-upload-button">
          Upload ELF file
          <input
            ref={fileInputRef}
            type="file"
            className="elf-file-input"
            accept=".o,.so,.elf,application/octet-stream"
            onChange={handleFileChange}
            aria-label="Upload ELF file"
          />
        </label>
        <button type="button" className="elf-button" onClick={handleClear}>Clear</button>
      </div>
      <label className="elf-paste-label" htmlFor="elf-base64-input">
        Or paste Base64-encoded ELF bytes
      </label>
      <textarea
        id="elf-base64-input"
        className="elf-paste-input"
        value={paste}
        onChange={(event) => setPaste(event.target.value)}
        placeholder="f0VMRg..."
        spellCheck={false}
      />
      <button type="button" className="elf-button" onClick={handlePasteInspect}>
        Inspect pasted bytes
      </button>
      {error && <div className="elf-error" role="alert">⚠ {error}</div>}
      {result?.warnings.map((warning) => (
        <div className="elf-error" role="alert" key={warning}>⚠ {warning}</div>
      ))}
      {result?.identification && result.header && (
        <div className="elf-results">
          <FieldTable title="ELF identification" values={result.identification} />
          <FieldTable title="ELF header" values={result.header} />
          <HeaderTable
            title="Program headers"
            rows={result.programHeaders}
            emptyMessage="This ELF file has no program headers."
            columns={[
              ['type', 'Type'], ['flags', 'Flags'], ['offset', 'Offset'],
              ['vaddr', 'Virtual address'],
              ['paddr', 'Physical address'], ['filesz', 'File size'], ['memsz', 'Memory size'],
              ['align', 'Alignment'],
            ]}
          />
          <HeaderTable
            title="Section headers"
            rows={result.sectionHeaders}
            emptyMessage="This ELF file has no section headers."
            columns={[
              ['name', 'Name'], ['type', 'Type'], ['flags', 'Flags'], ['addr', 'Address'],
              ['offset', 'Offset'], ['size', 'Size'], ['link', 'Link'], ['info', 'Info'],
              ['addralign', 'Alignment'], ['entsize', 'Entry size'],
            ]}
          />
        </div>
      )}
    </section>
  );
}
