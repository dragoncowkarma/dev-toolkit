import { useRef, useState } from 'react';
import { HEADER_BYTES, parseHex, parseVhdx } from './vhdx.utils.js';
import './vhdx.css';

function Fields({ values }) {
  return <dl>{values.map(([label, value]) => (
    <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>
  ))}</dl>;
}

/** Render the local VHDX header inspector. @returns {React.JSX.Element} Inspector UI. */
export default function VhdxHeaderInspectorTool() {
  const [hex, setHex] = useState('');
  const [result, setResult] = useState(null);
  const [dump, setDump] = useState('');
  const request = useRef(0);

  function inspect(bytes) {
    setResult(parseVhdx(bytes));
    const lines = [];
    for (let i = 0; i < bytes.length; i += 16) {
      const row = Array.from(bytes.subarray(i, i + 16), (byte) =>
        byte.toString(16).padStart(2, '0')).join(' ');
      lines.push(i.toString(16).padStart(8, '0') + '  ' + row);
    }
    setDump(lines.join('\n'));
  }

  async function readFile(file) {
    if (!file) return;
    const id = ++request.current;
    try {
      const buffer = await file.slice(0, HEADER_BYTES).arrayBuffer();
      if (id !== request.current) return;
      setHex('');
      inspect(new Uint8Array(buffer));
    } catch {
      if (id === request.current) {
        setDump('');
        setResult({ ok: false, error: 'Failed to read the selected file.' });
      }
    }
  }

  function inspectHex() {
    request.current += 1;
    const parsed = parseHex(hex);
    if (!parsed.ok) {
      setDump('');
      setResult(parsed);
      return;
    }
    inspect(parsed.bytes);
  }

  return (
    <section className="vhdx-tool" aria-label="VHDX header inspector">
      <p>Inspect the first 320 KiB locally. Stored checksums are shown but not verified.</p>
      <div className="vhdx-drop" onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); readFile(event.dataTransfer.files[0]); }}>
        <label htmlFor="vhdx-file">Choose a VHDX file or drop it here</label>
        <input id="vhdx-file" type="file" accept=".vhdx" onChange={(event) => {
          readFile(event.target.files[0]);
          event.target.value = '';
        }} />
      </div>
      <label htmlFor="vhdx-hex">Hex bytes (first 320 KiB)</label>
      <textarea id="vhdx-hex" value={hex} spellCheck={false} onChange={(event) => {
        request.current += 1;
        setHex(event.target.value);
        setResult(null);
        setDump('');
      }} />
      <button type="button" onClick={inspectHex}>Inspect hex</button>
      {result && !result.ok && <p role="alert" className="vhdx-error">{result.error}</p>}
      {result?.ok && <div>
        <h2>File identifier</h2>
        <Fields values={[[ 'Creator', result.creator || '(empty)' ]]} />
        {result.headers.map((header, index) => <section key={header.offset}>
          <h2>Header {index + 1} (offset {header.offset})</h2>
          <Fields values={[
            ['Stored checksum', '0x' + header.checksum.toString(16).padStart(8, '0')],
            ['Sequence number', header.sequence], ['File write GUID', header.fileWriteGuid],
            ['Data write GUID', header.dataWriteGuid], ['Log GUID', header.logGuid],
            ['Log version', header.logVersion], ['Version', header.version],
            ['Log length', header.logLength], ['Log offset', header.logOffset],
          ]} />
        </section>)}
        {result.regionTables.map((table, index) => <section key={table.offset}>
          <h2>Region table {index + 1} (offset {table.offset})</h2>
          <Fields values={[
            ['Stored checksum', '0x' + table.checksum.toString(16).padStart(8, '0')],
            ['Entry count', table.entries.length],
          ]} />
          {table.entries.map((entry, entryIndex) => <div key={entryIndex}>
            <h3>Region {entryIndex + 1}</h3>
            <Fields values={[
              ['GUID', entry.guid], ['Offset', entry.offset], ['Length', entry.length],
              ['Required', entry.required ? 'Yes' : 'No'],
            ]} />
          </div>)}
        </section>)}
      </div>}
      {dump && <><label htmlFor="vhdx-dump">Raw hex dump</label>
        <textarea id="vhdx-dump" readOnly value={dump} spellCheck={false} /></>}
    </section>
  );
}
