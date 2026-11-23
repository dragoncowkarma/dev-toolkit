import { useRef, useState } from 'react';
import { parseHex, parseSuperblock } from './apfs.utils.js';
import './apfs.css';

const hex = (value) => `0x${value.toString(16)}`;

/** Render the APFS container superblock inspector. */
export default function ApfsSuperblockInspectorTool() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const request = useRef(0);

  function inspect(bytes) {
    try {
      setResult(parseSuperblock(bytes));
      setError('');
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  function handleText(event) {
    request.current += 1;
    const value = event.target.value;
    setInput(value);
    if (!value.trim()) {
      setResult(null);
      setError('');
      return;
    }
    try {
      inspect(parseHex(value));
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const id = ++request.current;
    setInput('');
    setResult(null);
    setError('');
    try {
      const buffer = await file.slice(0, 4096).arrayBuffer();
      if (id === request.current) inspect(new Uint8Array(buffer));
    } catch {
      if (id === request.current) setError('Unable to read the selected file.');
    }
    event.target.value = '';
  }

  const rows = result && [
    ['Stored checksum', hex(result.checksum)],
    ['Computed checksum', result.computed === null ? 'Unavailable' : hex(result.computed)],
    ['Checksum status', result.checksumMatches === null
      ? 'Unavailable: block exceeds the 4096-byte read limit'
      : result.checksumMatches ? 'Match' : 'Mismatch'],
    ['Object ID', result.oid], ['Transaction ID', result.xid],
    ['Object type', hex(result.type)], ['Object subtype', hex(result.subtype)],
    ['Magic', result.magic], ['Block size', result.blockSize], ['Block count', result.blockCount],
    ['Features', `${hex(result.features)} (${result.featureLabels})`],
    ['Read-only compatible features', `${hex(result.compatible)} (${result.compatibleLabels})`],
    ['Incompatible features', `${hex(result.incompatible)} (${result.incompatibleLabels})`],
    ['Container UUID', result.uuid], ['Next object ID', result.nextOid],
    ['Next transaction ID', result.nextXid],
    ['Descriptor blocks (raw)', result.descriptorBlocks], ['Data blocks (raw)', result.dataBlocks],
    ['Descriptor base', result.descriptorBase], ['Data base', result.dataBase],
    ['Descriptor next', result.descriptorNext], ['Data next', result.dataNext],
    ['Descriptor index', result.descriptorIndex], ['Descriptor length', result.descriptorLength],
    ['Data index', result.dataIndex], ['Data length', result.dataLength],
  ];

  return (
    <section className="apfs-tool" aria-label="APFS superblock inspector">
      <p>Inspect the first 4096 bytes of a container image locally.</p>
      <label htmlFor="apfs-file">Select a file</label>
      <input id="apfs-file" type="file" onChange={handleFile} />
      <label htmlFor="apfs-hex">Or paste hexadecimal bytes</label>
      <textarea id="apfs-hex" value={input} onChange={handleText} spellCheck={false} />
      {error && <p className="apfs-error" role="alert">{error}</p>}
      {rows && (
        <div className="apfs-results">
          <h2>Container superblock</h2>
          <dl>
            {rows.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
