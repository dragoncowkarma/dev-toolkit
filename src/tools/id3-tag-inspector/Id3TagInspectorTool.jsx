import { useRef, useState } from 'react';
import { parseId3Tags } from './id3TagInspector.utils.js';
import './id3TagInspector.css';

const FIELD_LABELS = {
  title: 'Title', artist: 'Artist', album: 'Album', year: 'Year', genre: 'Genre', comment: 'Comment',
};

/**
 * Renders a client-side ID3 metadata inspector for uploaded MP3 files.
 *
 * @returns {React.JSX.Element} The ID3 inspector UI.
 */
export default function Id3TagInspectorTool() {
  const inputRef = useRef(null);
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState('Choose an MP3 file to inspect its metadata.');
  const [error, setError] = useState('');

  async function inspectFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.mp3')) {
      setError('Please choose an MP3 file.');
      setResult(null);
      return;
    }
    try {
      const parsed = parseId3Tags(await file.arrayBuffer());
      setResult(parsed);
      setFileName(file.name);
      setError('');
      setMessage(parsed.hasTag ? `Loaded ${file.name}.` : `Loaded ${file.name}; no ID3 tag found.`);
    } catch (caughtError) {
      setResult(null);
      setError(caughtError.message);
      setMessage('Unable to inspect the selected file.');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    inspectFile(event.dataTransfer.files?.[0]);
  }

  return (
    <section className="id3-tag-inspector" aria-label="ID3 Tag Inspector">
      <div
        className="id3-tag-inspector__drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <p>Drop an MP3 file here, or choose one from your device.</p>
        <label className="id3-tag-inspector__button">
          Choose MP3 file
          <input
            ref={inputRef}
            type="file"
            accept="audio/mpeg,.mp3"
            onChange={(event) => inspectFile(event.target.files?.[0])}
          />
        </label>
      </div>

      <p className="id3-tag-inspector__status" role="status" aria-live="polite">{message}</p>
      {error && <div className="id3-tag-inspector__error" role="alert">⚠ {error}</div>}

      {result?.hasTag && (
        <div className="id3-tag-inspector__results">
          <h2>{fileName}</h2>
          <p className="id3-tag-inspector__versions">
            Detected: {[result.v2 && `ID3v${result.v2.version}`, result.v1 && `ID3v${result.v1.version}`]
              .filter(Boolean).join(' and ')}
          </p>
          <dl>
            {Object.entries(FIELD_LABELS).map(([key, label]) => result.fields[key] && (
              <div key={key}><dt>{label}</dt><dd>{result.fields[key]}</dd></div>
            ))}
            {result.v2?.coverArt && <div><dt>Cover art</dt><dd>Present ({result.v2.coverArt.mimeType})</dd></div>}
          </dl>
        </div>
      )}
    </section>
  );
}
