import { useEffect, useRef, useState } from 'react';
import { parseQnx6Superblock, PREFIX_SIZE } from './qnx6Superblock.utils.js';
import './qnx6-superblock-inspector.css';

const hex = (value) => '0x' + value.toString(16).padStart(8, '0');

/** Inspect the first standard QNX6 superblock in a local image. */
export default function Qnx6SuperblockInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [filename, setFilename] = useState('');
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);

  async function inspect(file) {
    if (!file) return;
    const id = ++request.current;
    setFilename(file.name);
    setResult(null);
    setError('');
    try {
      const buffer = await file.slice(0, PREFIX_SIZE).arrayBuffer();
      const parsed = parseQnx6Superblock(buffer);
      if (request.current === id) setResult(parsed);
    } catch (err) {
      if (request.current === id) setError(err.message || 'Failed to read file.');
    }
  }

  const fields = result && [
    ['Offset', result.offset + ' bytes'], ['Endianness', result.endianness],
    ['Magic', hex(result.magic)], ['Checksum (stored)', hex(result.checksum)],
    ['Serial', result.serial.toString()], ['Creation time (Unix seconds)', result.ctime],
    ['Last access time (Unix seconds)', result.atime], ['Flags', hex(result.flags)],
    ['Version', result.version1 + '.' + result.version2], ['Volume ID (hex)', result.volumeId],
    ['Block size', result.blockSize], ['Inodes', result.inodeCount],
    ['Free inodes', result.freeInodes], ['Blocks', result.blockCount],
    ['Free blocks', result.freeBlocks], ['Allocation group', result.allocationGroup],
  ];
  return (
    <section className="qnx6-tool" aria-label="QNX6 Superblock Inspector">
      <p>Inspect the first standard QNX6 superblock at byte 8192 or byte 0, locally.</p>
      <p>Checksums are shown as stored and are not validated. The second copy is not inspected.</p>
      <div className="qnx6-drop" onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); inspect(event.dataTransfer.files[0]); }}>
        <label htmlFor="qnx6-file">Choose a QNX6 image or drop it here</label>
        <input id="qnx6-file" type="file" onChange={(event) => {
          inspect(event.target.files?.[0]);
          event.target.value = '';
        }} />
      </div>
      {filename && <p role="status">Selected: {filename}</p>}
      {error && <p className="qnx6-error" role="alert">{error}</p>}
      {result && <>
        <h2>Superblock</h2>
        <dl className="qnx6-fields">
          {fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <h2>Root nodes</h2>
        {Object.entries(result.roots).map(([name, root]) => <section key={name}>
          <h3>{name}</h3>
          <dl className="qnx6-fields">
            <div><dt>Size</dt><dd>{root.size.toString()}</dd></div>
            <div><dt>Levels</dt><dd>{root.levels}</dd></div>
            <div><dt>Mode</dt><dd>{root.mode}</dd></div>
            <div><dt>Block pointers</dt><dd>{root.pointers.map(hex).join(', ')}</dd></div>
          </dl>
        </section>)}
      </>}
    </section>
  );
}
