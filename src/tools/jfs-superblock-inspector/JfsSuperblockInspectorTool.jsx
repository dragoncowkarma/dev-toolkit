import { useRef, useState } from 'react';
import {
  parseHex, parseSuperblock, sampleHex, SUPERBLOCK_LENGTH, SUPERBLOCK_OFFSET,
} from './jfs.utils.js';
import './jfs.css';

/** Inspect a primary JFS superblock without sending data to a server. */
export default function JfsSuperblockInspectorTool() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const request = useRef(0);
  const fileInput = useRef(null);

  function setHexInput(value) {
    request.current += 1;
    setInput(value);
    setResult(value.trim() ? parseHex(value) : null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function readFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const id = ++request.current;
    setInput('');
    setResult(null);
    try {
      const buffer = await file.slice(SUPERBLOCK_OFFSET, SUPERBLOCK_OFFSET + SUPERBLOCK_LENGTH)
        .arrayBuffer();
      if (id === request.current) setResult(parseSuperblock(new Uint8Array(buffer)));
    } catch {
      if (id === request.current) setResult({ error: 'Failed to read the selected file.' });
    }
  }

  return (
    <section className="jfs-tool" aria-label="JFS Superblock Inspector">
      <p>Inspect a disk image or paste superblock bytes in hexadecimal.
        Data stays in your browser.</p>
      <div className="jfs-actions">
        <label className="btn">Upload disk image
          <input ref={fileInput} type="file" aria-label="Upload disk image" onChange={readFile} />
        </label>
        <button type="button" className="btn" onClick={() => setHexInput(sampleHex())}>
          Sample
        </button>
        <button type="button" className="btn" onClick={() => setHexInput('')}>Clear</button>
      </div>
      <label htmlFor="jfs-hex">Superblock hex (starting with JFS1)</label>
      <textarea id="jfs-hex" value={input} onChange={(event) => setHexInput(event.target.value)}
        spellCheck={false} placeholder="4a 46 53 31 …" />
      {result?.error && <p role="alert">{result.error}</p>}
      {result?.data && <dl className="jfs-result">
        {Object.entries(result.data).map(([key, value]) => (
          <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
        ))}
      </dl>}
    </section>
  );
}
