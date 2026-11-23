import { useRef, useState } from 'react';
import { formatBytes, formatDuration, parseDsfHeader } from './dsf-header.utils.js';
import './dsf-header-inspector.css';

const FIELD_LABELS = [
  ['DSD chunk size', 'dsdChunkSize'],
  ['Declared file size', 'fileSize'],
  ['Metadata pointer', 'metadataPointer'],
  ['Format version', 'formatVersion'],
  ['Format ID', 'formatId'],
  ['Channel type', 'channelType'],
  ['Channel count', 'channelCount'],
  ['Sampling frequency', 'samplingFrequency'],
  ['Bits per sample', 'bitsPerSample'],
  ['Sample count', 'sampleCount'],
  ['Block size per channel', 'blockSizePerChannel'],
  ['Reserved', 'reserved'],
  ['Data chunk size', 'dataChunkSize'],
  ['Audio payload size', 'audioPayloadSize'],
];

/**
 * Renders a browser-only inspector for DSD Stream File headers.
 * @returns {React.JSX.Element} The DSF inspector UI.
 */
export default function DsfHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);
  const requestCounterRef = useRef(0);

  async function inspectFile(file) {
    const requestId = (requestCounterRef.current += 1);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseDsfHeader(buffer);
      if (requestCounterRef.current !== requestId) return;
      setResult(parsed);
      setFileName(file.name);
      setError('');
    } catch (caughtError) {
      if (requestCounterRef.current !== requestId) return;
      setResult(null);
      setFileName(file.name);
      setError(caughtError.message);
    }
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (file) inspectFile(file);
  }

  function handleDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) inspectFile(file);
  }

  function clearResult() {
    requestCounterRef.current += 1;
    setResult(null);
    setError('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="dsf-inspector" aria-label="DSF Header Inspector">
      <div
        className="dsf-inspector__drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <p>Drop a .dsf file here, or choose one from your device.</p>
        <label className="dsf-inspector__button">
          Choose DSF file
          <input
            ref={fileInputRef}
            className="dsf-inspector__file-input"
            type="file"
            accept=".dsf,application/octet-stream"
            onChange={handleFileChange}
            aria-label="Choose a DSF file"
          />
        </label>
        {(result || error) && (
          <button className="dsf-inspector__button" type="button" onClick={clearResult}>
            Clear
          </button>
        )}
      </div>

      {fileName && <p className="dsf-inspector__file-name">Inspecting: {fileName}</p>}
      {error && <p className="dsf-inspector__error" role="alert">{error}</p>}

      {result && (
        <div className="dsf-inspector__result">
          <p className="dsf-inspector__duration">
            Duration: {formatDuration(result.durationSeconds)}
          </p>
          <dl className="dsf-inspector__fields">
            {FIELD_LABELS.map(([label, key]) => (
              <div key={key} className="dsf-inspector__field">
                <dt>{label}</dt>
                <dd>{formatField(key, result[key])}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}

function formatField(key, value) {
  if (key === 'fileSize' || key === 'dataChunkSize' || key === 'audioPayloadSize') {
    return `${value} (${formatBytes(value)})`;
  }
  if (key === 'samplingFrequency') return `${value} Hz`;
  if (key === 'metadataPointer') return value === 0 ? '0 (no ID3v2 metadata)' : value;
  if (key === 'formatId') return value === 0 ? '0 (DSD raw)' : value;
  return value;
}
