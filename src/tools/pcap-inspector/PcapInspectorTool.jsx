import { useRef, useState } from 'react';
import { formatPacketTimestamp, parsePcapFile } from './pcapInspector.utils.js';
import './pcapInspector.css';

/**
 * Renders a client-side inspector for classic libpcap file headers and packet records.
 * @returns {React.JSX.Element} The PCAP inspector UI.
 */
export default function PcapInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);
  const requestRef = useRef(0);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const requestId = ++requestRef.current;
    try {
      const parsed = await parsePcapFile(file);
      if (requestRef.current !== requestId) return;
      setResult(parsed);
      setFileName(file.name);
      setError('');
    } catch (parseError) {
      if (requestRef.current !== requestId) return;
      setResult(null);
      setFileName('');
      setError(parseError.message);
    }
  }

  function handleClear() {
    requestRef.current += 1;
    setResult(null);
    setFileName('');
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="pcap-inspector" aria-label="PCAP File Header Inspector">
      <div className="pcap-inspector__toolbar">
        <label className="pcap-inspector__button pcap-inspector__file-button">
          Choose PCAP file
          <input
            ref={fileInputRef}
            className="pcap-inspector__file-input"
            type="file"
            accept=".pcap,application/vnd.tcpdump.pcap,application/octet-stream"
            aria-label="Choose a PCAP file to inspect"
            onChange={handleFileChange}
          />
        </label>
        <button type="button" className="pcap-inspector__button" onClick={handleClear}>
          Clear
        </button>
      </div>
      <p className="pcap-inspector__privacy-note">Files are parsed locally and never uploaded.</p>

      {error && <div className="pcap-inspector__error" role="alert">{error}</div>}

      {result && (
        <div className="pcap-inspector__results">
          <h2>{fileName}</h2>
          <section aria-labelledby="pcap-global-header">
            <h3 id="pcap-global-header">Global header</h3>
            <dl className="pcap-inspector__header-grid">
              <div><dt>Magic</dt><dd>{result.header.magic}</dd></div>
              <div><dt>Byte order</dt><dd>{result.header.byteOrder}</dd></div>
              <div>
                <dt>Version</dt>
                <dd>{result.header.versionMajor}.{result.header.versionMinor}</dd>
              </div>
              <div>
                <dt>Timestamp resolution</dt>
                <dd>{result.header.timestampResolution}</dd>
              </div>
              <div><dt>Timezone offset</dt><dd>{result.header.timezoneOffset}</dd></div>
              <div><dt>Timestamp accuracy</dt><dd>{result.header.timestampAccuracy}</dd></div>
              <div><dt>Snaplen</dt><dd>{result.header.snaplen}</dd></div>
              <div>
                <dt>Link-layer type</dt>
                <dd>{result.header.linkTypeName} ({result.header.linkType})</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="pcap-packets">
            <h3 id="pcap-packets">Packet records ({result.packets.length})</h3>
            <div className="pcap-inspector__packet-list" role="region" aria-label="Packet records">
              <div className="pcap-inspector__packet-row pcap-inspector__packet-heading" role="row">
                <span>Packet</span><span>Timestamp</span><span>Captured</span><span>Original</span>
              </div>
              <ol className="pcap-inspector__packets" aria-label="Parsed packet records">
                {result.packets.map((packet) => (
                  <li className="pcap-inspector__packet-row" key={packet.index}>
                    <span>{packet.index}</span>
                    <span>{formatPacketTimestamp(packet, result.header.timestampResolution)}</span>
                    <span>{packet.capturedLength} B</span>
                    <span>{packet.originalLength} B</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
