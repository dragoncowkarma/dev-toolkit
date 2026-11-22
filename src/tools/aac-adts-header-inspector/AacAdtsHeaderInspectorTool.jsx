import { useRef, useState } from 'react';
import { parseAdtsStream } from './aacAdts.utils.js';
import './aacAdts.css';

const fields = [
  ['MPEG version', 'mpegVersion'],
  ['Layer', 'layer'],
  ['CRC protection', 'protectionAbsent'],
  ['Object type', 'profile'],
  ['Sampling frequency', 'samplingFrequency'],
  ['Channel configuration', 'channelLayout'],
  ['Frame length', 'frameLength'],
  ['Buffer fullness', 'bufferFullness'],
  ['Raw data blocks', 'rawDataBlocks'],
];

function displayValue(key, value) {
  if (key === 'protectionAbsent') return value ? 'Absent' : 'Present';
  if (key === 'samplingFrequency') return `${value.toLocaleString()} Hz`;
  if (key === 'frameLength') return `${value.toLocaleString()} bytes`;
  return value;
}

/**
 * Renders a client-side AAC ADTS header inspector.
 *
 * @returns {React.JSX.Element} The inspector UI.
 */
export default function AacAdtsHeaderInspectorTool() {
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    setFileName(file.name);
    try {
      setResult(parseAdtsStream(await file.arrayBuffer()));
    } catch {
      setResult({
        status: 'undecoded',
        message: 'The selected file could not be read.',
        frames: [],
      });
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    inspectFile(event.dataTransfer.files?.[0]);
  }

  function handleClear() {
    setFileName('');
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="aac-adts-tool" aria-label="AAC ADTS Header Inspector">
      <div
        className={`aac-adts-dropzone ${isDragging ? 'is-dragging' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <p>Choose an AAC/ADTS file or drag one here.</p>
        <label className="aac-adts-button">
          Select file
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/aac,.aac,.adts"
            onChange={(event) => inspectFile(event.target.files?.[0])}
          />
        </label>
        <p className="aac-adts-hint">Files are parsed locally in your browser.</p>
      </div>

      {fileName && (
        <div className="aac-adts-file-row">
          <span>Inspecting: {fileName}</span>
          <button type="button" className="aac-adts-button" onClick={handleClear}>
            Clear
          </button>
        </div>
      )}

      {result?.status === 'undecoded' && (
        <div className="aac-adts-error" role="alert">{result.message}</div>
      )}

      {result?.status === 'decoded' && (
        <div className="aac-adts-results">
          <p role="status">
            Found {result.frames.length} ADTS frame{result.frames.length === 1 ? '' : 's'}.
          </p>
          {result.frames.map((frame) => (
            <article className="aac-adts-frame" key={frame.offset}>
              <h2>Frame {frame.number}</h2>
              <dl>
                {fields.map(([label, key]) => (
                  <div className="aac-adts-field" key={key}>
                    <dt>{label}</dt>
                    <dd>{displayValue(key, frame[key])}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
