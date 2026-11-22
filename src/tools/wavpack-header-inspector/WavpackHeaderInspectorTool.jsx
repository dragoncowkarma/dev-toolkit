import { useRef, useState } from 'react';
import { parseWavpackHeader } from './wavpackHeaderInspector.utils.js';
import styles from './WavpackHeaderInspectorTool.module.css';

/**
 * Renders a client-side WavPack (.wv) block header inspector.
 *
 * @returns {React.JSX.Element} The WavPack inspector UI.
 */
export default function WavpackHeaderInspectorTool() {
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);
  const readRequestRef = useRef(0);

  async function inspectFile(file) {
    if (!file) return;
    const requestId = (readRequestRef.current += 1);
    const buffer = await file.arrayBuffer();
    if (readRequestRef.current !== requestId) return;
    setFileName(file.name);
    setResult(parseWavpackHeader(buffer));
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
    <section className={styles.inspector} aria-label="WavPack Header Inspector">
      <input
        ref={inputRef}
        className={styles.input}
        type="file"
        accept="audio/x-wavpack,.wv"
        onChange={handleFileChange}
        aria-label="Choose a WavPack file"
      />
      <div
        className={`${styles.dropzone} ${isDragging ? styles.dropzoneDragging : ''}`}
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
        <span aria-hidden="true">♪</span>
        <strong>Drop a WavPack (.wv) file here</strong>
        <span>or choose a file to inspect its block header locally</span>
      </div>

      {fileName && <p className={styles.filename}>Inspecting: {fileName}</p>}

      {result && !result.valid && (
        <div className={styles.error} role="alert">
          {result.error}
        </div>
      )}

      {result && result.valid && (
        <div className={styles.results} role="status" aria-live="polite">
          <section aria-labelledby="wavpack-block-title">
            <h3 id="wavpack-block-title">Block header</h3>
            <dl className={styles.metadata}>
              <div><dt>Signature</dt><dd><code>{result.signature}</code></dd></div>
              <div><dt>Block size (ckSize)</dt><dd>{result.ckSize} bytes</dd></div>
              <div><dt>Version</dt><dd>{result.versionLabel}</dd></div>
              <div><dt>Track number</dt><dd>{result.trackNo}</dd></div>
              <div><dt>Index number</dt><dd>{result.indexNo}</dd></div>
              <div><dt>Total samples</dt><dd>{result.totalSamplesLabel}</dd></div>
              <div><dt>Block index</dt><dd>{result.blockIndex}</dd></div>
              <div><dt>Block samples</dt><dd>{result.blockSamples}</dd></div>
              <div>
                <dt>CRC</dt>
                <dd>0x{result.crc.toString(16).padStart(8, '0').toUpperCase()}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="wavpack-flags-title">
            <h3 id="wavpack-flags-title">Decoded flags</h3>
            <dl className={styles.metadata}>
              <div><dt>Bytes per sample</dt><dd>{result.flags.bytesPerSample}</dd></div>
              <div>
                <dt>Sample representation</dt>
                <dd>{result.flags.isFloatData ? 'Float' : 'Integer'}</dd>
              </div>
              <div><dt>Channel mode</dt><dd>{result.flags.channelMode}</dd></div>
              <div><dt>Hybrid mode</dt><dd>{result.flags.isHybrid ? 'Yes' : 'No'}</dd></div>
              <div><dt>Joint stereo</dt><dd>{result.flags.isJointStereo ? 'Yes' : 'No'}</dd></div>
              <div><dt>Sample rate</dt><dd>{result.flags.sampleRateLabel}</dd></div>
              <div>
                <dt>Raw flags</dt>
                <dd>0x{result.flags.raw.toString(16).padStart(8, '0').toUpperCase()}</dd>
              </div>
            </dl>
          </section>

          {result.warnings.length > 0 && (
            <div className={styles.warning} role="alert">
              <strong>Inspection warnings</strong>
              <ul>
                {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
