import { useRef, useState } from 'react';
import { parseSwfHeader, twipsToPixels } from './swfHeader.utils.js';
import './swfHeader.css';

function formatPixels(twips) {
  return twipsToPixels(twips).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function FrameSize({ frameSize }) {
  const width = frameSize.xmax - frameSize.xmin;
  const height = frameSize.ymax - frameSize.ymin;

  return (
    <>
      <dt>Frame size</dt>
      <dd>
        {width.toLocaleString()} × {height.toLocaleString()} twips
        <span className="swf-header-inspector__secondary">
          {formatPixels(width)} × {formatPixels(height)} px
        </span>
      </dd>
      <dt>Frame bounds</dt>
      <dd>
        X: {frameSize.xmin.toLocaleString()} to {frameSize.xmax.toLocaleString()} twips; Y:{' '}
        {frameSize.ymin.toLocaleString()} to {frameSize.ymax.toLocaleString()} twips
      </dd>
    </>
  );
}

/**
 * Renders a browser-only inspector for Adobe Flash SWF file headers.
 *
 * @returns {React.JSX.Element} The SWF header inspector UI.
 */
export default function SwfHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      setResult(null);
      setFileName('');
      setError('No file selected. Choose an SWF file to inspect.');
      return;
    }

    try {
      const header = parseSwfHeader(await file.arrayBuffer());
      setResult(header);
      setFileName(file.name);
      setError('');
    } catch (caughtError) {
      setResult(null);
      setFileName(file.name);
      setError(caughtError.message);
    }
  }

  function handleClear() {
    setResult(null);
    setError('');
    setFileName('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  return (
    <section className="swf-header-inspector" aria-label="SWF Header Inspector">
      <div className="swf-header-inspector__toolbar">
        <label className="swf-header-inspector__file-button">
          Choose SWF file
          <input
            ref={inputRef}
            type="file"
            accept=".swf,application/x-shockwave-flash"
            onChange={handleFileChange}
            aria-label="Choose an SWF file to inspect"
          />
        </label>
        <button type="button" className="swf-header-inspector__clear" onClick={handleClear}>
          Clear
        </button>
      </div>

      <p className="swf-header-inspector__hint">
        Files are inspected entirely in your browser and are never uploaded.
      </p>

      {fileName && <p className="swf-header-inspector__file-name">Inspecting: {fileName}</p>}

      {error && (
        <div className="swf-header-inspector__error" role="alert">
          {error}
        </div>
      )}

      {result && (
        <section className="swf-header-inspector__results" aria-labelledby="swf-header-results">
          <h2 id="swf-header-results">SWF header</h2>
          <dl>
            <dt>Signature</dt>
            <dd>{result.signature}</dd>
            <dt>Version</dt>
            <dd>{result.version}</dd>
            <dt>Compression</dt>
            <dd>{result.compression}</dd>
            <dt>Declared file length</dt>
            <dd>{result.fileLength.toLocaleString()} bytes</dd>
            {!result.decompressionRequired && (
              <>
                <FrameSize frameSize={result.frameSize} />
                <dt>Frame rate</dt>
                <dd>
                  {result.frameRate.toLocaleString(undefined, { maximumFractionDigits: 3 })} fps
                </dd>
                <dt>Frame count</dt>
                <dd>{result.frameCount.toLocaleString()}</dd>
              </>
            )}
          </dl>
          {result.decompressionRequired && (
            <p className="swf-header-inspector__notice" role="status">
              Frame size, frame rate, and frame count require decompression and are not shown.
            </p>
          )}
        </section>
      )}
    </section>
  );
}
