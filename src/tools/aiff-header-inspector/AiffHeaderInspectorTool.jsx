import { Fragment, useRef, useState } from 'react';
import { parseAiffHeader } from './aiff.utils.js';
import './aiff-header-inspector.css';

function formatSampleRate(sampleRate) {
  return Number.isFinite(sampleRate) ? `${sampleRate.toLocaleString()} Hz` : String(sampleRate);
}

/**
 * Renders a browser-only AIFF/AIFC metadata inspector.
 *
 * @returns {React.JSX.Element} The inspector UI.
 */
export default function AiffHeaderInspector() {
  const [metadata, setMetadata] = useState(null);
  const [status, setStatus] = useState('Choose an AIFF or AIFC file to inspect its headers.');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const requestIdRef = useRef(0);

  async function inspectFile(file) {
    if (!file) return;
    const requestId = (requestIdRef.current += 1);
    try {
      const parsed = parseAiffHeader(await file.arrayBuffer());
      if (requestIdRef.current !== requestId) return;
      setMetadata(parsed);
      setError('');
      const chunkLabel = parsed.chunks.length === 1 ? 'chunk' : 'chunks';
      setStatus(`Inspected ${file.name}. Found ${parsed.chunks.length} ${chunkLabel}.`);
    } catch (caughtError) {
      if (requestIdRef.current !== requestId) return;
      setMetadata(null);
      setError(caughtError.message);
      setStatus('Unable to inspect the selected file.');
    }
  }

  function handleFileChange(event) {
    inspectFile(event.target.files?.[0]);
  }

  function handleDrop(event) {
    event.preventDefault();
    inspectFile(event.dataTransfer.files?.[0]);
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  }

  return (
    <section className="aiff-inspector" aria-label="AIFF Header Inspector">
      <input
        ref={fileInputRef}
        className="aiff-inspector__file-input"
        type="file"
        accept=".aiff,.aif,.aifc,audio/aiff"
        aria-label="Choose an AIFF or AIFC file"
        onChange={handleFileChange}
      />
      <div
        className="aiff-inspector__drop-zone"
        role="button"
        tabIndex="0"
        aria-label="Drop an AIFF or AIFC file here, or press Enter to choose one"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={handleKeyDown}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <strong>Drop an AIFF or AIFC file here</strong>
        <span>or press Enter to choose a file. Audio is never played or decoded.</span>
      </div>

      <p className="aiff-inspector__status" role="status" aria-live="polite">{status}</p>
      {error && <p className="aiff-inspector__error" role="alert">{error}</p>}

      {metadata && (
        <div className="aiff-inspector__results">
          <dl className="aiff-inspector__metadata">
            <dt>FORM type</dt>
            <dd>{metadata.formType}</dd>
            <dt>FORM size</dt>
            <dd>{metadata.formSize.toLocaleString()} bytes</dd>
            {metadata.common && <>
              <dt>Channels</dt><dd>{metadata.common.channels}</dd>
              <dt>Sample frames</dt><dd>{metadata.common.sampleFrames.toLocaleString()}</dd>
              <dt>Bits per sample</dt><dd>{metadata.common.bitsPerSample}</dd>
              <dt>Sample rate</dt><dd>{formatSampleRate(metadata.common.sampleRate)}</dd>
              {metadata.common.compressionType && <>
                <dt>Compression type</dt><dd>{metadata.common.compressionType}</dd>
                <dt>Compression name</dt><dd>{metadata.common.compressionName}</dd>
              </>}
            </>}
            {metadata.soundData && <>
              <dt>Sound data offset</dt><dd>{metadata.soundData.offset.toLocaleString()}</dd>
              <dt>Sound data block size</dt><dd>{metadata.soundData.blockSize.toLocaleString()}</dd>
            </>}
          </dl>

          <h2>Chunks</h2>
          <dl className="aiff-inspector__metadata">
            {metadata.chunks.map((chunk, index) => (
              <Fragment key={`${chunk.id}-${index}`}>
                <dt>{chunk.id}</dt>
                <dd>{chunk.size.toLocaleString()} bytes</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
