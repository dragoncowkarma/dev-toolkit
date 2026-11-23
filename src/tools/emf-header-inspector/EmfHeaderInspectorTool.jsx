import { useEffect, useRef, useState } from 'react';
import { decodeInput, parseEmfHeader } from './emf.utils.js';
import './emf.css';

/** Render the EMF header inspector. */
export default function EmfHeaderInspectorTool() {
  const [format, setFormat] = useState('hex');
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const request = useRef(0);
  const fileRef = useRef(null);

  useEffect(() => () => { request.current += 1; }, []);

  function inspectText(value, selectedFormat) {
    if (!value.trim()) return setResult(null);
    const decoded = decodeInput(value, selectedFormat);
    setResult(decoded.ok ? parseEmfHeader(decoded.bytes) : decoded);
  }

  function changeInput(event) {
    request.current += 1;
    const value = event.target.value;
    setInput(value);
    if (fileRef.current) fileRef.current.value = '';
    inspectText(value, format);
  }

  function changeFormat(event) {
    request.current += 1;
    const value = event.target.value;
    setFormat(value);
    if (fileRef.current) fileRef.current.value = '';
    inspectText(input, value);
  }

  async function changeFile(event) {
    const file = event.target.files?.[0];
    const id = ++request.current;
    if (!file) return;
    setInput('');
    setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      if (request.current === id) setResult(parseEmfHeader(buffer));
    } catch {
      if (request.current === id) setResult({ ok: false, error: 'Failed to read the file.' });
    }
  }

  const header = result?.ok ? result.header : null;
  const fields = header && [
    ['Record type', header.recordType], ['Record size (bytes)', header.recordSize],
    ['Bounds (left, top, right, bottom)', header.bounds.join(', ')],
    ['Frame (left, top, right, bottom)', header.frame.join(', ')],
    ['Signature', header.signature],
    ['Version', `0x${header.version.toString(16).padStart(8, '0')}`],
    ['File bytes', header.fileBytes], ['Record count', header.recordCount],
    ['Handle count', header.handleCount],
    ['Description length (UTF-16 units)', header.descriptionLength],
    ['Description offset', header.descriptionOffset], ['Description', header.description || 'None'],
    ['Palette entries', header.paletteEntries],
    ['Device size (pixels)', header.device.join(' × ')],
    ['Device size (millimeters)', header.millimeters.join(' × ')],
  ];

  return (
    <section className="emf-tool" aria-label="EMF header inspector">
      <label htmlFor="emf-format">Input format</label>
      <select id="emf-format" value={format} onChange={changeFormat}>
        <option value="hex">Hexadecimal</option>
        <option value="base64">Base64</option>
      </select>
      <label htmlFor="emf-input">EMF file contents</label>
      <textarea id="emf-input" value={input} onChange={changeInput} spellCheck={false}
        placeholder="Paste the complete file contents" />
      <label htmlFor="emf-file">Or upload an EMF file</label>
      <input id="emf-file" type="file" accept=".emf,image/emf" ref={fileRef}
        onChange={changeFile} />
      {result && !result.ok && <p className="emf-error" role="alert">{result.error}</p>}
      {header && <section aria-labelledby="emf-summary">
        <h2 id="emf-summary">Header summary</h2>
        <dl>{fields.map(([name, value]) => <div key={name}>
          <dt>{name}</dt><dd>{value}</dd>
        </div>)}</dl>
      </section>}
    </section>
  );
}
