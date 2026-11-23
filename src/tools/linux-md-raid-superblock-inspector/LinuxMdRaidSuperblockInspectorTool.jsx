import { useRef, useState } from 'react';
import { inspectFile, parseHex, parseSuperblock } from './md.utils.js';
import './md.css';

/** Render the local Linux MD superblock inspector. */
export default function LinuxMdRaidSuperblockInspector() {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const request = useRef(0);
  const fileInput = useRef(null);

  function edit(event) {
    request.current += 1;
    setFileName('');
    const value = event.target.value;
    setText(value);
    if (!value.trim()) return setResult(null);
    try {
      setResult(parseSuperblock(parseHex(value)));
    } catch (error) {
      setResult({ error: error.message });
    }
  }

  async function read(file) {
    if (!file) return;
    const id = ++request.current;
    setFileName(file.name);
    setText('');
    setResult(null);
    try {
      const next = await inspectFile(file);
      if (id === request.current) setResult(next);
    } catch {
      if (id === request.current) setResult({ error: 'Could not read the file.' });
    }
  }

  function clear() {
    request.current += 1;
    setText('');
    setFileName('');
    setResult(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <section className="md-inspector" aria-label="Linux MD RAID Superblock Inspector">
      <p>Inspect an mdadm v1 superblock locally. No file data leaves your browser.</p>
      <div className="md-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        event.preventDefault();
        read(event.dataTransfer.files[0]);
      }}>
        <label htmlFor="md-file">Choose or drop a device image</label>
        <input id="md-file" ref={fileInput} type="file"
          onChange={(event) => read(event.target.files[0])} />
        {fileName && <p>{fileName}</p>}
      </div>
      <label htmlFor="md-hex">Superblock hex</label>
      <textarea id="md-hex" value={text} onChange={edit} spellCheck={false}
        placeholder="Paste hexadecimal superblock bytes" />
      <button type="button" className="btn" onClick={clear}>Clear</button>
      {result?.error && <p role="alert">{result.error}</p>}
      {result?.diagnostic && <p role="alert">{result.diagnostic}</p>}
      {result?.fields && (
        <dl>
          {result.offset !== undefined && <><dt>File offset</dt><dd>{result.offset} bytes</dd></>}
          {Object.entries(result.fields).map(([key, value]) => (
            <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      )}
    </section>
  );
}
