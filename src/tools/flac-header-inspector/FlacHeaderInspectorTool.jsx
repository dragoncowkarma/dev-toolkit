import { useRef, useState } from 'react';
import { formatDuration, parseFlacMetadata } from './flac.utils.js';
import './flac-header-inspector.css';

function MetadataList({ title, entries }) {
  return (
    <section className="flac-header-inspector__panel" aria-labelledby={`${title}-title`}>
      <h3 id={`${title}-title`}>{title}</h3>
      <dl>
        {entries.map(([label, value]) => (
          <div key={label} className="flac-header-inspector__field">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Renders a local-only FLAC metadata inspector.
 *
 * @returns {React.JSX.Element} The FLAC header inspector UI.
 */
export default function FlacHeaderInspectorTool() {
  const inputRef = useRef(null);
  const requestRef = useRef(0);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  async function inspectFile(file) {
    if (!file) return;
    const requestId = (requestRef.current += 1);
    try {
      const metadata = parseFlacMetadata(await file.arrayBuffer());
      if (requestRef.current !== requestId) return;
      setFileName(file.name);
      setResult(metadata);
      setError('');
    } catch (inspectionError) {
      if (requestRef.current !== requestId) return;
      setFileName(file.name);
      setResult(null);
      setError(inspectionError.message || 'Unable to inspect this file.');
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

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  const streamInfo = result?.streamInfo;
  return (
    <section className="flac-header-inspector" aria-label="FLAC Header Inspector">
      <input
        ref={inputRef}
        className="flac-header-inspector__input"
        type="file"
        accept=".flac,audio/flac"
        aria-label="Choose a FLAC file to inspect"
        onChange={handleFileChange}
      />
      <div
        className={`flac-header-inspector__dropzone ${isDragging ? 'is-dragging' : ''}`}
        role="button"
        tabIndex="0"
        aria-describedby="flac-inspector-help"
        onClick={() => inputRef.current?.click()}
        onKeyDown={handleKeyDown}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <span aria-hidden="true">♫</span>
        <strong>Drop a FLAC file here</strong>
        <span id="flac-inspector-help">or press Enter or Space to choose one</span>
      </div>

      <div className="flac-header-inspector__status" aria-live="polite">
        {fileName && !error && `Inspected ${fileName} locally. No audio was uploaded or played.`}
      </div>
      {error && <div className="flac-header-inspector__error" role="alert">{error}</div>}

      {streamInfo && (
        <MetadataList
          title="STREAMINFO"
          entries={[
            ['Sample rate', `${streamInfo.sampleRate.toLocaleString()} Hz`],
            ['Channels', streamInfo.channels],
            ['Bits per sample', streamInfo.bitsPerSample],
            ['Total samples', streamInfo.totalSamples.toLocaleString()],
            ['Duration', formatDuration(streamInfo.durationSeconds)],
            ['Block size', `${streamInfo.minBlockSize}–${streamInfo.maxBlockSize} samples`],
            ['Frame size', `${streamInfo.minFrameSize}–${streamInfo.maxFrameSize} bytes`],
            ['MD5 signature', <code>{streamInfo.md5}</code>],
          ]}
        />
      )}

      {result && (
        <section className="flac-header-inspector__panel" aria-labelledby="metadata-blocks-title">
          <h3 id="metadata-blocks-title">Metadata blocks</h3>
          <ul className="flac-header-inspector__blocks">
            {result.blocks.map((block, index) => (
              <li key={`${block.type}-${index}`}>
                <strong>{block.typeName}</strong> <span>{block.length} bytes</span>
                {block.vorbisComment && (
                  <div className="flac-header-inspector__comments">
                    <p>Vendor: {block.vorbisComment.vendor || 'Not specified'}</p>
                    {block.vorbisComment.comments.length > 0 && (
                      <dl>
                        {block.vorbisComment.comments.map((comment, commentIndex) => (
                          <div key={`${comment.key}-${commentIndex}`}>
                            <dt>{comment.key}</dt><dd>{comment.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
