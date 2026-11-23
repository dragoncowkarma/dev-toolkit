import { useRef, useState } from 'react';
import { parseHex, parseLabel, readLabelFile } from './zfs-label.utils.js';
import './zfs-label.css';

/** Inspect a selected file or pasted hex without uploading it. */
export default function ZfsLabelTool() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const request = useRef(0);

  function inspect(bytes) {
    try {
      setResult(parseLabel(bytes));
      setError('');
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const id = ++request.current;
    setResult(null);
    setError('');
    try {
      const bytes = await readLabelFile(file);
      if (request.current === id) inspect(bytes);
    } catch (err) {
      if (request.current === id) setError(err.message);
    }
  }

  function handleHex() {
    request.current += 1;
    try {
      inspect(parseHex(input));
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  return (
    <section className="zfs-label-tool" aria-label="ZFS Label Inspector">
      <p>Inspect the first vdev label locally. Files and hex stay in your browser.</p>
      <label htmlFor="zfs-file">Select a file</label>
      <input id="zfs-file" type="file" onChange={handleFile} />
      <label htmlFor="zfs-hex">Or paste label hex</label>
      <textarea id="zfs-hex" value={input} spellCheck={false} onChange={(event) => {
        request.current += 1;
        setInput(event.target.value);
        setResult(null);
        setError('');
      }} />
      <button type="button" onClick={handleHex}>Inspect hex</button>
      {error && <div className="zfs-error" role="alert">{error}</div>}
      {result && <>
        <h2>NVList</h2>
        <dl>{Object.entries(result.fields).map(([key, value]) => (
          <div key={key}><dt>{key}</dt><dd>{value ?? 'Not present'}</dd></div>
        ))}</dl>
        <h2>Active uberblock</h2>
        {result.uberblock ? <dl>{Object.entries(result.uberblock).map(([key, value]) => (
          <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
        ))}</dl> : <p>No valid uberblock found.</p>}
      </>}
    </section>
  );
}
