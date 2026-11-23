import { useEffect, useRef, useState } from 'react';
import { decodeInput, parseWmfHeader } from './wmf.utils.js';
import './wmf.css';

/** Render the WMF header inspector. */
export default function WmfHeaderInspectorTool() {
  const [format, setFormat] = useState('hex');
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const request = useRef(0);
  const fileRef = useRef(null);

  useEffect(() => () => { request.current += 1; }, []);

  function inspectText(value, selectedFormat) {
    if (!value.trim()) return setResult(null);
    const decoded = decodeInput(value, selectedFormat);
    setResult(decoded.ok ? parseWmfHeader(decoded.bytes) : decoded);
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
      if (request.current === id) setResult(parseWmfHeader(buffer));
    } catch {
      if (request.current === id) setResult({ ok: false, error: 'Failed to read the file.' });
    }
  }

  const header = result?.ok ? result.header : null;
  const placeableRows = header?.placeable ? [
    ['Magic', `0x${header.magic.toString(16).toUpperCase()}`],
    ['Handle', header.handle],
    ['Bounding box (left, top, right, bottom)', header.bounds.join(', ')],
    ['Units per inch', header.unitsPerInch],
    ['Checksum', `0x${header.checksum.toString(16).padStart(4, '0')} (valid)`],
  ] : [];
  const fields = header && [
    ['Placeable header', header.placeable ? 'Yes (Aldus)' : 'No (standard WMF)'],
    ...placeableRows,
    ['Metafile type', header.type === 1 ? '1 (Memory)' : '2 (Disk)'],
    ['Header size (16-bit words)', `${header.headerSize} (${header.headerBytes} bytes)`],
    ['Version', `0x${header.version.toString(16).padStart(4, '0')}`],
    ['File size (16-bit words)', `${header.fileSize} (${header.fileBytes} bytes)`],
    ['Object count', header.objectCount],
    ['Max record size (16-bit words)', header.maxRecord],
    ['Member count', header.memberCount],
  ];

  return (
    <section className="wmf-tool" aria-label="WMF header inspector">
      <label htmlFor="wmf-format">Input format</label>
      <select id="wmf-format" value={format} onChange={changeFormat}>
        <option value="hex">Hexadecimal</option>
        <option value="base64">Base64</option>
      </select>
      <label htmlFor="wmf-input">WMF file contents</label>
      <textarea id="wmf-input" value={input} onChange={changeInput} spellCheck={false}
        placeholder="Paste the complete file contents" />
      <label htmlFor="wmf-file">Or upload a WMF file</label>
      <input id="wmf-file" type="file" accept=".wmf,image/wmf" ref={fileRef}
        onChange={changeFile} />
      {result && !result.ok && <p className="wmf-error" role="alert">{result.error}</p>}
      {header && <section aria-labelledby="wmf-summary">
        <h2 id="wmf-summary">Header summary</h2>
        <dl>{fields.map(([name, value]) => <div key={name}>
          <dt>{name}</dt><dd>{value}</dd>
        </div>)}</dl>
      </section>}
    </section>
  );
}
