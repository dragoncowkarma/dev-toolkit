import { useCallback, useRef, useState } from 'react';
import { formatFileSize, isMidiFile, parseMidiFile } from './midi-file-inspector.utils.js';
import './midi-file-inspector.css';

/**
 * Renders the MIDI File Inspector tool: a file picker / dropzone that parses a Standard
 * MIDI File (SMF) header and track chunks entirely in the browser.
 *
 * @returns {React.JSX.Element} The MIDI File Inspector tool UI.
 */
export default function MidiFileInspectorTool() {
  const [fileMeta, setFileMeta] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const requestRef = useRef(0);

  const processFile = useCallback(async (file) => {
    const requestId = (requestRef.current += 1);
    setError('');
    setResult(null);

    if (!isMidiFile(file)) {
      setFileMeta(null);
      setError('Please choose a .mid or .midi file.');
      return;
    }

    setFileMeta({ name: file.name, size: file.size });

    try {
      const buffer = await file.arrayBuffer();
      if (requestRef.current !== requestId) return;
      setResult(parseMidiFile(buffer));
    } catch (err) {
      if (requestRef.current !== requestId) return;
      setError(err.message || 'Failed to read the selected file.');
    }
  }, []);

  function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (selected) processFile(selected);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragActive(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) processFile(dropped);
  }

  function handleDragOver(event) {
    event.preventDefault();
    setIsDragActive(true);
  }

  function handleDragLeave() {
    setIsDragActive(false);
  }

  function handleDropzoneKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  }

  function handleClear() {
    requestRef.current += 1;
    setFileMeta(null);
    setResult(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <section className="midi-tool" aria-label="MIDI File Inspector">
      <div
        className={`midi-dropzone ${isDragActive ? 'active' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Upload a Standard MIDI File (.mid or .midi) by clicking or dragging it here"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={handleDropzoneKeyDown}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <p className="midi-dropzone-text">
          {fileMeta ? fileMeta.name : 'Drop a .mid / .midi file here, or click to choose one'}
        </p>
        {fileMeta && <p className="midi-dropzone-meta">{formatFileSize(fileMeta.size)}</p>}
        <input
          ref={fileInputRef}
          type="file"
          className="midi-file-input"
          accept=".mid,.midi,audio/midi"
          onChange={handleFileChange}
          aria-label="Choose a MIDI file"
        />
      </div>

      <div className="midi-toolbar-actions">
        <button type="button" className="btn" onClick={handleClear} disabled={!fileMeta}>
          Clear
        </button>
      </div>

      {error && (
        <div className="midi-error" role="alert">
          ⚠ {error}
        </div>
      )}

      {result && <MidiResult result={result} />}
    </section>
  );
}

/**
 * Renders the parsed MThd header, chunk list, and any warnings/errors.
 *
 * @param {object} props
 * @param {object} props.result - The object returned by `parseMidiFile`.
 * @returns {React.JSX.Element} The results panel.
 */
function MidiResult({ result }) {
  const { header, chunks, warnings, errors } = result;

  return (
    <div className="midi-result">
      {errors.length > 0 && (
        <div className="midi-error" role="alert">
          {errors.map((message) => (
            <p key={message}>⚠ {message}</p>
          ))}
        </div>
      )}

      {header && (
        <div className="midi-section">
          <h3 className="midi-section-title">Header (MThd)</h3>
          <dl className="midi-field-list">
            <div className="midi-field">
              <dt>Format</dt>
              <dd>
                {header.format} — {header.formatLabel}
              </dd>
            </div>
            <div className="midi-field">
              <dt>Tracks (ntrks)</dt>
              <dd>{header.numTracks}</dd>
            </div>
            <div className="midi-field">
              <dt>Header length</dt>
              <dd>{header.length} bytes</dd>
            </div>
            <div className="midi-field">
              <dt>Time division</dt>
              <dd>
                {header.division.type === 'tpqn'
                  ? `${header.division.ticksPerQuarterNote} ticks per quarter-note`
                  : `${header.division.label}, ${header.division.ticksPerFrame} ticks per frame`}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="midi-warning" role="alert">
          {warnings.map((message) => (
            <p key={message}>⚠ {message}</p>
          ))}
        </div>
      )}

      {chunks.length > 0 && (
        <div className="midi-section">
          <h3 className="midi-section-title">Chunks</h3>
          <table className="midi-chunk-table">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Offset</th>
                <th scope="col">Length</th>
                <th scope="col">Status</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {chunks.map((chunk) => (
                <tr key={`${chunk.id}-${chunk.offset}`}>
                  <td>{chunk.id}</td>
                  <td>{chunk.offset}</td>
                  <td>{chunk.declaredLength}</td>
                  <td>{chunk.complete ? 'Complete' : 'Truncated'}</td>
                  <td>
                    {chunk.type === 'track' ? <TrackDetails info={chunk.trackInfo} /> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Summarizes the metadata extracted from one MTrk chunk's bounded event scan.
 *
 * @param {object} props
 * @param {object} props.info - The track info object produced during chunk parsing.
 * @returns {string} A human-readable, dot-separated summary of track metadata.
 */
function TrackDetails({ info }) {
  if (!info) return '—';

  const parts = [];
  if (info.trackName) parts.push(`Name: ${info.trackName}`);
  if (info.instrumentName) parts.push(`Instrument: ${info.instrumentName}`);
  if (info.tempoBpm) parts.push(`Tempo: ${info.tempoBpm} BPM`);
  if (info.timeSignature) {
    parts.push(`Time sig: ${info.timeSignature.numerator}/${info.timeSignature.denominator}`);
  }
  if (info.endOfTrack) parts.push('End of track found');
  if (info.truncated) parts.push('Event data truncated');
  if (info.malformed) parts.push(`Malformed: ${info.malformed}`);

  return parts.length > 0 ? parts.join(' · ') : 'No metadata found';
}
