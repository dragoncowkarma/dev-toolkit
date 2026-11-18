import { useRef, useState } from 'react';
import { formatByteSize, parseMp4Boxes } from './mp4-box-inspector.utils.js';
import './mp4-box-inspector.css';

function BoxTree({ boxes, depth = 0 }) {
  return (
    <ul
      className="mp4-box-inspector__tree"
      aria-label={depth === 0 ? 'MP4 box tree' : undefined}
    >
      {boxes.map((box) => (
        <li key={`${box.offset}-${box.type}`}>
          <div className="mp4-box-inspector__box">
            <code>{box.type}</code>
            <span>offset {box.offset}</span>
            <span>{formatByteSize(box.size)}</span>
            {box.userType && <span title={box.userType}>UUID {box.userType}</span>}
          </div>
          {box.children?.length > 0 && <BoxTree boxes={box.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

function MetadataSummary({ metadata }) {
  const movieDuration = metadata.movie?.timescale
    ? (metadata.movie.duration / metadata.movie.timescale).toFixed(3)
    : null;

  return (
    <section className="mp4-box-inspector__summary" aria-label="MP4 metadata summary">
      <h2>Metadata summary</h2>
      {metadata.fileType && (
        <div>
          <h3>File type (ftyp)</h3>
          <p>Major brand: <code>{metadata.fileType.majorBrand}</code></p>
          <p>Minor version: {metadata.fileType.minorVersion}</p>
          <p>
            Compatible:{' '}
            {metadata.fileType.compatibleBrands.map((brand, index) => (
              <code key={`${brand}-${index}`}>{`${brand} `}</code>
            ))}
          </p>
        </div>
      )}
      {metadata.movie && (
        <div>
          <h3>Movie header (mvhd)</h3>
          <p>Timescale: {metadata.movie.timescale} ticks/second</p>
          <p>Duration: {metadata.movie.duration} ticks{movieDuration && ` (${movieDuration}s)`}</p>
        </div>
      )}
      {metadata.tracks.length > 0 && (
        <div>
          <h3>Tracks (tkhd)</h3>
          <p>Track IDs: {metadata.tracks.map((track) => track.trackId).join(', ')}</p>
        </div>
      )}
      {metadata.media.length > 0 && (
        <p>Media handlers: {metadata.media.map((item) => item.handlerType).join(', ')}</p>
      )}
      {metadata.sampleDescriptions.length > 0 && (
        <p>
          Sample entries:{' '}
          {metadata.sampleDescriptions.flatMap((item) => item.entries).join(', ') || 'None'}
        </p>
      )}
    </section>
  );
}

/**
 * Renders a client-side ISOBMFF box tree and common MP4 metadata fields.
 *
 * @returns {React.JSX.Element} The MP4 Box Inspector tool UI.
 */
export default function Mp4BoxInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseMp4Boxes(await file.arrayBuffer());
      setResult(parsed);
      setFileName(file.name);
      setError('');
    } catch (parseError) {
      setResult(null);
      setFileName('');
      setError(
        parseError instanceof Error ? parseError.message : 'Unable to inspect this file.'
      );
    }
  }

  function handleClear() {
    setResult(null);
    setFileName('');
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="mp4-box-inspector" aria-label="MP4 Box Inspector">
      <div className="mp4-box-inspector__toolbar">
        <label className="mp4-box-inspector__upload">
          Choose MP4, MOV, or M4A
          <input
            ref={inputRef}
            type="file"
            accept=".mp4,.mov,.m4a,video/mp4,video/quicktime,audio/mp4"
            onChange={handleFileChange}
            aria-label="Choose an MP4, MOV, or M4A file"
          />
        </label>
        <button type="button" onClick={handleClear}>Clear</button>
      </div>
      {error && (
        <div className="mp4-box-inspector__error" role="alert">
          ⚠ {error}
        </div>
      )}
      {result && (
        <div className="mp4-box-inspector__results">
          <section className="mp4-box-inspector__boxes" aria-label="Parsed MP4 boxes">
            <h2>{fileName}</h2>
            <p>Type, byte offset, and box size</p>
            <BoxTree boxes={result.boxes} />
          </section>
          <MetadataSummary metadata={result.metadata} />
        </div>
      )}
    </section>
  );
}
