import { useEffect, useRef, useState } from 'react';
import { decodeSuperblock, inspectImage, parseHex } from './ufs.utils.js';
import './ufs.css';

/** Render the client-side UFS superblock inspector. */
export default function UfsSuperblockTool() {
  const [hex, setHex] = useState('');
  const [result, setResult] = useState(null);
  const [filename, setFilename] = useState('');
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);

  async function readFile(file) {
    if (!file) return;
    const id = ++request.current;
    setHex('');
    setFilename(file.name);
    setResult(null);
    try {
      const next = await inspectImage(file);
      if (id === request.current) setResult(next);
    } catch {
      if (id === request.current) setResult({ fields: {}, error: 'Could not read image.' });
    }
  }

  function changeHex(event) {
    request.current += 1;
    setFilename('');
    const value = event.target.value;
    setHex(value);
    if (!value.trim()) return setResult(null);
    try {
      setResult(decodeSuperblock(parseHex(value)));
    } catch (error) {
      setResult({ fields: {}, error: error.message });
    }
  }

  return (
    <section className="ufs-tool" aria-label="UFS Superblock Inspector">
      <p>Inspect a BSD UFS1 or UFS2 superblock locally in your browser.</p>
      <div
        className="ufs-drop"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          readFile(event.dataTransfer.files[0]);
        }}
      >
        <label htmlFor="ufs-file">Choose or drop a filesystem image</label>
        <input id="ufs-file" type="file" onChange={(event) => readFile(event.target.files[0])} />
        {filename && <p>Image: {filename}</p>}
      </div>
      <label htmlFor="ufs-hex">Or paste hex bytes from the start of a superblock</label>
      <textarea id="ufs-hex" value={hex} onChange={changeHex} spellCheck={false} />
      {result?.error && <div role="alert" className="ufs-error">{result.error}</div>}
      {result && Object.keys(result.fields).length > 0 && (
        <dl>
          {result.offset !== undefined && <><dt>Image offset</dt><dd>{result.offset}</dd></>}
          {Object.entries(result.fields).map(([name, value]) => (
            <div key={name}><dt>{name}</dt><dd>{String(value)}</dd></div>
          ))}
        </dl>
      )}
    </section>
  );
}
