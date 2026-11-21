import { useRef, useState } from 'react';
import { parseMidiHeader } from './midiHeaderParser.js';
import './midi-header-inspector.css';

/**
 * Renders a client-side inspector for Standard MIDI File headers and track chunks.
 *
 * @returns {React.JSX.Element} The MIDI header inspector UI.
 */
export default function MidiHeaderInspectorTool() {
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setResult(parseMidiHeader(bytes));
      setFileName(file.name);
      setError('');
    } catch (parseError) {
      setResult(null);
      setFileName(file.name);
      setError(parseError.message || 'Unable to parse this MIDI file.');
    }
  }

  function handleClear() {
    setFileName('');
    setResult(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="midi-header-inspector" aria-label="MIDI File Header Inspector">
      <div className="midi-header-inspector__toolbar">
        <label className="midi-header-inspector__button">
          Choose MIDI File
          <input
            ref={inputRef}
            className="midi-header-inspector__file-input"
            type="file"
            accept=".mid,.midi,audio/midi,audio/x-midi"
            onChange={handleFileChange}
          />
        </label>
        <button type="button" className="midi-header-inspector__button" onClick={handleClear}>
          Clear
        </button>
      </div>

      {fileName && <p className="midi-header-inspector__file-name">File: {fileName}</p>}

      {error && (
        <div className="midi-header-inspector__error" role="alert">
          {error}
        </div>
      )}

      {result && <MidiStructure result={result} />}
    </section>
  );
}

function MidiStructure({ result }) {
  const { header, tracks } = result;
  const division = header.division;
  const divisionText = division.type === 'smpte'
    ? `SMPTE: ${division.framesPerSecond} fps, ${division.ticksPerFrame} ticks/frame`
    : `${division.ticksPerQuarterNote} ticks per quarter note`;

  return (
    <div className="midi-header-inspector__results">
      <section className="midi-header-inspector__chunk" aria-labelledby="midi-header-title">
        <h2 id="midi-header-title">MThd Header Chunk</h2>
        <dl>
          <div><dt>Offset</dt><dd>{header.offset} bytes</dd></div>
          <div><dt>Declared length</dt><dd>{header.length} bytes</dd></div>
          <div><dt>Format type</dt><dd>{header.formatType}</dd></div>
          <div><dt>Track count</dt><dd>{header.trackCount}</dd></div>
          <div><dt>Division</dt><dd>{divisionText}</dd></div>
        </dl>
      </section>

      <section className="midi-header-inspector__chunk" aria-labelledby="midi-tracks-title">
        <h2 id="midi-tracks-title">MTrk Track Chunks</h2>
        {tracks.length === 0 ? (
          <p>No track chunks declared.</p>
        ) : (
          <ol className="midi-header-inspector__track-list">
            {tracks.map((track) => (
              <li key={track.index}>
                <strong>Track {track.index}</strong>
                <span>Chunk offset: {track.offset} bytes</span>
                <span>Data offset: {track.dataOffset} bytes</span>
                <span>Declared length: {track.length} bytes</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
