import { useRef, useState } from 'react';
import {
  createSample, formatHex, parseHex, parseXfsSuperblock, readSuperblock,
} from './xfs.utils.js';
import './xfs.css';

/** Render a browser-only XFS superblock inspector. */
export default function XfsSuperblockInspectorTool() {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const request = useRef(0);
  const fileInput = useRef(null);
  const hex = input ? parseHex(input) : null;
  const result = hex?.ok ? parseXfsSuperblock(hex.bytes) : hex;
  const dump = hex?.ok ? formatHex(hex.bytes.slice(0, 512)) : '';

  function changeInput(value) {
    request.current += 1;
    setInput(value);
    setError('');
    setCopied(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function loadFile(event) {
    const file = event.target.files?.[0];
    const id = ++request.current;
    setInput(''); setError(''); setCopied(false);
    if (!file) return;
    try {
      const bytes = await readSuperblock(file);
      if (request.current === id) setInput(formatHex(bytes));
    } catch {
      if (request.current === id) setError('Unable to read file.');
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(dump);
      setCopied(true); setError('');
    } catch {
      setError('Failed to copy to clipboard.');
    }
  }

  return (
    <section className="xfs-tool" aria-label="XFS Superblock Inspector">
      <p>Inspect the first 512 bytes locally. Files are never uploaded.</p>
      <div className="xfs-actions">
        <label htmlFor="xfs-file">XFS image file</label>
        <input id="xfs-file" ref={fileInput} type="file" onChange={loadFile} />
        <button type="button" onClick={() => changeInput(formatHex(createSample(4)))}>
          Sample v4
        </button>
        <button type="button" onClick={() => changeInput(formatHex(createSample(5)))}>
          Sample v5
        </button>
        <button type="button" onClick={() => changeInput('')}>Clear</button>
      </div>
      <label htmlFor="xfs-hex">Superblock hex</label>
      <textarea id="xfs-hex" value={input} onChange={(e) => changeInput(e.target.value)} />
      {(error || (result && !result.ok)) && (
        <div role="alert" className="xfs-error">{error || result.error}</div>
      )}
      {result?.ok && <>
        <h2>Superblock fields (version {result.version})</h2>
        <dl className="xfs-fields">{Object.entries(result.fields).map(([name, value]) => (
          <div key={name}><dt>{name}</dt><dd>{value}</dd></div>
        ))}</dl>
      </>}
      {dump && <>
        <div className="xfs-actions"><label htmlFor="xfs-dump">Hex dump</label>
          <button type="button" onClick={copy}>Copy</button>
          {copied && <span role="status">Copied to clipboard</span>}
        </div>
        <textarea id="xfs-dump" readOnly value={dump} />
      </>}
    </section>
  );
}
