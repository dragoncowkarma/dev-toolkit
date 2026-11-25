import { useRef, useState } from 'react';
import { inspectCrt } from './crt.js';

const hex = (value, width) => value.toString(16).toUpperCase().padStart(width, '0');

/** Render a local CRT file inspector. */
export default function C64CrtInspectorTool() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);

  async function selectFile(event) {
    const id = ++request.current;
    const file = event.target.files?.[0];
    setReport(null);
    setLoading(Boolean(file));
    if (!file) return;
    const result = await inspectCrt(file);
    if (request.current === id) {
      setReport(result);
      setLoading(false);
    }
  }

  return (
    <section aria-label="C64 CRT Cartridge Inspector">
      <p>Inspect a CRT file locally. Cartridge image data is not read or uploaded.</p>
      <label htmlFor="crt-file">Select CRT file</label>{' '}
      <input id="crt-file" type="file" accept=".crt" onChange={selectFile} />
      {loading && <p role="status">Inspecting file…</p>}
      {report?.header && (
        <div>
          <h3>Cartridge header</h3>
          <dl>
            <dt>Name</dt><dd>{report.header.name || '(empty)'}</dd>
            <dt>Header length</dt><dd>{report.header.headerLength} bytes</dd>
            <dt>Version</dt><dd>0x{hex(report.header.version, 4)}</dd>
            <dt>Hardware</dt>
            <dd>{report.header.hardwareName} ({report.header.hardware})</dd>
            <dt>EXROM</dt><dd>{report.header.exrom}</dd>
            <dt>GAME</dt><dd>{report.header.game}</dd>
          </dl>
          <h3>CHIP packets ({report.chips.length})</h3>
          <ol>
            {report.chips.map((chip, index) => (
              <li key={index}>
                {chip.typeName} ({chip.type}), bank {chip.bank}, load address 0x
                {hex(chip.address, 4)}, image {chip.imageSize} bytes,
                packet {chip.length} bytes
              </li>
            ))}
          </ol>
        </div>
      )}
      {report?.warnings.length > 0 && (
        <div role="alert"><h3>Warnings</h3><ul>
          {report.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
        </ul></div>
      )}
    </section>
  );
}
