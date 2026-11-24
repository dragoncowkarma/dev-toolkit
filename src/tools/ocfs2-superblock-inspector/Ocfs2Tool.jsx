import { useEffect, useRef, useState } from 'react';
import { inspectFile, inspectHex } from './ocfs2.utils.js';
import './ocfs2.css';

function format(value) {
  return value === null || value === undefined ? 'Unknown' : String(value);
}

function formatFlags(flags) {
  if (!flags) return 'Unknown';
  const hex = (number) => `0x${number.toString(16).padStart(8, '0')}`;
  const details = [...flags.known];
  if (flags.unknown) details.push(`Unknown bits: ${hex(flags.unknown)}`);
  return `${hex(flags.value)} (${details.length ? details.join(', ') : 'none'})`;
}

/** Display an OCFS2 superblock from a local image or hex input. */
export default function Ocfs2Tool() {
  const [hex, setHex] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);

  async function run(reader) {
    const id = ++request.current;
    setResult(null);
    setBusy(true);
    const next = await reader();
    if (request.current !== id) return;
    setResult(next);
    setBusy(false);
  }

  const data = result?.data;
  const fields = data && [
    ['Superblock offset', `${data.offset} bytes`],
    ['Candidate block size', `${data.blockSize} bytes`],
    ['Major revision', format(data.major)],
    ['Minor revision', format(data.minor)],
    ['Block size bits', format(data.blockBits)],
    ['Cluster size bits', format(data.clusterBits)],
    ['UUID', format(data.uuid)],
    ['Label', data.label === '' ? '(empty)' : format(data.label)],
    ['Compatible features', formatFlags(data.compat)],
    ['Incompatible features', formatFlags(data.incompat)],
    ['Read-only compatible features', formatFlags(data.roCompat)],
    ['Maximum slots', format(data.maxSlots)],
    ['Root directory block', format(data.root)],
    ['System directory block', format(data.systemDir)],
  ];
  return (
    <section className="ocfs2-tool" aria-label="OCFS2 Superblock Inspector">
      <p>Inspect a disk image locally. Only the candidate superblock ranges are read.</p>
      <label htmlFor="ocfs2-file">Disk image</label>
      <input id="ocfs2-file" type="file" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) run(() => inspectFile(file));
      }} />
      <label htmlFor="ocfs2-hex">Or paste a hex-encoded disk image</label>
      <textarea id="ocfs2-hex" value={hex} spellCheck={false} onChange={(event) => {
        request.current += 1;
        setBusy(false);
        setResult(null);
        setHex(event.target.value);
      }} />
      <button type="button" onClick={() => run(() => inspectHex(hex))} disabled={!hex.trim()}>
        Inspect hex
      </button>
      {busy && <p role="status">Reading…</p>}
      {result?.error && <p role="alert">{result.error}</p>}
      {fields && <dl>{fields.map(([name, value]) => (
        <div key={name}><dt>{name}</dt><dd>{value}</dd></div>
      ))}</dl>}
    </section>
  );
}
