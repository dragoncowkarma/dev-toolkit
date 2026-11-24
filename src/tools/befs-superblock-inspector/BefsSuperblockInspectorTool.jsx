import { useRef, useState } from 'react';
import { inspectSuperblock, parseHex } from './befs.utils.js';
import './befs.css';

function formatRun(run) {
  return `Allocation group: ${run.allocationGroup}, start: ${run.start}, length: ${run.length}`;
}

/** Render the local BFS superblock inspector. */
export default function BefsSuperblockInspectorTool() {
  const [hex, setHex] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const request = useRef(0);

  function inspect(bytes) {
    try {
      setResult(inspectSuperblock(bytes));
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
      const buffer = await file.slice(0, 1536).arrayBuffer();
      if (id === request.current) inspect(new Uint8Array(buffer));
    } catch {
      if (id === request.current) setError('Failed to read the selected file.');
    }
  }

  return (
    <section className="befs-tool" aria-label="BeFS superblock inspector">
      <p>Inspect a raw superblock or disk image. Files stay in your browser.</p>
      <label htmlFor="befs-file">Disk image or raw superblock file</label>
      <input id="befs-file" type="file" onChange={handleFile} />
      <label htmlFor="befs-hex">Raw superblock as hexadecimal bytes</label>
      <textarea
        id="befs-hex"
        value={hex}
        onChange={(event) => {
          request.current += 1;
          setHex(event.target.value);
          setResult(null);
          setError('');
        }}
        spellCheck={false}
      />
      <button type="button" onClick={() => {
        request.current += 1;
        try { inspect(parseHex(hex)); } catch (err) { setResult(null); setError(err.message); }
      }}>
        Inspect hex
      </button>
      {error && <p className="befs-warning" role="alert">{error}</p>}
      {result && (
        <div aria-live="polite">
          {result.warnings.map((warning) => (
            <p className="befs-warning" key={warning}>{warning}</p>
          ))}
          {result.warnings.length === 0 && <p>All three magic values are valid.</p>}
          <dl>
            <dt>Superblock offset</dt><dd>{result.offset}</dd>
            <dt>Byte order</dt><dd>{result.byteOrder}</dd>
            <dt>Name</dt><dd>{result.name || '(empty)'}</dd>
            <dt>block_size</dt><dd>{result.blockSize}</dd>
            <dt>block_shift</dt><dd>{result.blockShift}</dd>
            <dt>num_blocks</dt><dd>{result.numBlocks.toString()}</dd>
            <dt>used_blocks</dt><dd>{result.usedBlocks.toString()}</dd>
            <dt>flags</dt><dd>0x{result.flags.toString(16).padStart(8, '0').toUpperCase()}</dd>
            <dt>Log area</dt><dd>{formatRun(result.logBlocks)}</dd>
            <dt>Log start</dt><dd>{result.logStart.toString()}</dd>
            <dt>Log end</dt><dd>{result.logEnd.toString()}</dd>
            <dt>Root directory</dt><dd>{formatRun(result.rootDirectory)}</dd>
            <dt>Indices</dt><dd>{formatRun(result.indices)}</dd>
          </dl>
        </div>
      )}
    </section>
  );
}
