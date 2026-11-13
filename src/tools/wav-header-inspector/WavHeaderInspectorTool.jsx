import { useRef, useState } from 'react';
import { formatDuration, parseWavHeader } from './wav-header-inspector.utils.js';
import './wav-header-inspector.css';

/**
 * Renders a client-side RIFF/WAVE header inspector.
 *
 * @returns {React.JSX.Element} The WAV inspector UI.
 */
export default function WavHeaderInspectorTool() {
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);
  const readRequestRef = useRef(0);

  async function inspectFile(file) {
    if (!file) return;
    const requestId = (readRequestRef.current += 1);
    try {
      const buffer = await file.arrayBuffer();
      if (readRequestRef.current !== requestId) return;
      const parsed = parseWavHeader(buffer);
      setFileName(file.name);
      setResult(parsed);
      setError('');
    } catch (parseError) {
      if (readRequestRef.current !== requestId) return;
      setFileName(file.name);
      setResult(null);
      setError(parseError.message || 'Unable to inspect this WAV file.');
    }
  }

  function handleFileChange(event) {
    inspectFile(event.target.files?.[0]);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    inspectFile(event.dataTransfer.files?.[0]);
  }

  function handleDragOver(event) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event) {
    if (event.currentTarget === event.target) setIsDragging(false);
  }

  return (
    <section className="wav-inspector" aria-label="WAV Header Inspector">
      <input
        ref={inputRef}
        className="wav-inspector__input"
        type="file"
        accept="audio/wav,.wav"
        onChange={handleFileChange}
        aria-label="Choose a WAV file"
      />
      <div
        className={`wav-inspector__dropzone ${
          isDragging ? 'wav-inspector__dropzone--dragging' : ''
        }`}
        role="button"
        tabIndex="0"
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
        }}
      >
        <span aria-hidden="true">◖</span>
        <strong>Drop a WAV file here</strong>
        <span>or choose a file to inspect its header locally</span>
      </div>

      {fileName && <p className="wav-inspector__filename">Inspecting: {fileName}</p>}
      {error && (
        <div className="wav-inspector__error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <div className="wav-inspector__results" role="status" aria-live="polite">
          <section aria-labelledby="wav-format-title">
            <h3 id="wav-format-title">RIFF/WAVE format</h3>
            <dl className="wav-inspector__metadata">
              <div><dt>Declared RIFF size</dt><dd>{result.riffSize} bytes</dd></div>
              {result.format ? (
                <>
                  <div><dt>Audio format</dt><dd>{result.format.audioFormatLabel}</dd></div>
                  <div><dt>Channels</dt><dd>{result.format.channels}</dd></div>
                  <div><dt>Sample rate</dt><dd>{result.format.sampleRate} Hz</dd></div>
                  <div><dt>Byte rate</dt><dd>{result.format.byteRate} bytes/sec</dd></div>
                  <div><dt>Block align</dt><dd>{result.format.blockAlign} bytes</dd></div>
                  <div><dt>Bits per sample</dt><dd>{result.format.bitsPerSample}</dd></div>
                </>
              ) : (
                <div><dt>Audio format</dt><dd>No fmt chunk found</dd></div>
              )}
              {result.data && (
                <>
                  <div><dt>Data payload</dt><dd>{result.data.size} bytes</dd></div>
                  <div>
                    <dt>Duration</dt>
                    <dd>
                      {result.data.duration === null
                        ? 'Unavailable for this format'
                        : formatDuration(result.data.duration)}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </section>
          <section aria-labelledby="wav-chunks-title">
            <h3 id="wav-chunks-title">Top-level chunks</h3>
            <div className="wav-inspector__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Byte offset</th>
                    <th scope="col">Declared size</th>
                  </tr>
                </thead>
                <tbody>
                  {result.chunks.map((chunk) => (
                    <tr key={`${chunk.offset}-${chunk.id}`}>
                      <td><code>{chunk.id}</code></td>
                      <td>{chunk.offset}</td>
                      <td>{chunk.size} bytes</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
