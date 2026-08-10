import { useEffect, useMemo, useRef, useState } from 'react';
import { QrCapacityError, drawQrToCanvas, generateQrCode } from './qrCode.utils.js';
import './qrCode.css';

const ERROR_CORRECTION_OPTIONS = [
  ['L', 'L — Low (~7%)'],
  ['M', 'M — Medium (~15%)'],
  ['Q', 'Q — Quartile (~25%)'],
  ['H', 'H — High (~30%)'],
];

const MIN_MODULE_SIZE = 2;
const MAX_MODULE_SIZE = 16;
const DEFAULT_MODULE_SIZE = 8;

/**
 * Renders the QR Code generator tool: a text/URL input that regenerates a
 * scannable QR code in real time, with error-correction level, output size,
 * PNG download, and copy-to-clipboard controls.
 *
 * @returns {React.JSX.Element} The QR Code tool UI.
 */
export default function QrCodeTool() {
  const [text, setText] = useState('');
  const [errorCorrectionLevel, setErrorCorrectionLevel] = useState('M');
  const [moduleSize, setModuleSize] = useState(DEFAULT_MODULE_SIZE);
  const [copyStatus, setCopyStatus] = useState({ state: 'idle', message: '' });
  const canvasRef = useRef(null);

  const result = useMemo(() => {
    if (text === '') return { qr: null, error: '' };
    try {
      return { qr: generateQrCode(text, { errorCorrectionLevel }), error: '' };
    } catch (err) {
      if (err instanceof QrCapacityError) {
        return { qr: null, error: err.message };
      }
      return { qr: null, error: 'Could not generate a QR code for this input.' };
    }
  }, [text, errorCorrectionLevel]);

  // Draw the generated matrix to the canvas whenever it (or the pixel scale) changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!result.qr) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    drawQrToCanvas(canvas, result.qr.matrix, { moduleSize });
  }, [result.qr, moduleSize]);

  useEffect(() => {
    if (copyStatus.state === 'idle') return undefined;
    const timer = setTimeout(() => setCopyStatus({ state: 'idle', message: '' }), 2500);
    return () => clearTimeout(timer);
  }, [copyStatus.state]);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas || !result.qr) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'qr-code.png';
      link.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  async function handleCopy() {
    const canvas = canvasRef.current;
    if (!canvas || !result.qr) return;
    try {
      await new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error('Failed to render image.'));
            return;
          }
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ [blob.type]: blob }),
            ]);
            resolve();
          } catch (err) {
            reject(err);
          }
        }, 'image/png');
      });
      setCopyStatus({ state: 'success', message: 'QR code image copied to clipboard.' });
    } catch {
      setCopyStatus({ state: 'error', message: 'Failed to copy the QR code image.' });
    }
  }

  const showPlaceholder = text === '' && !result.error;

  return (
    <section className="qr-code-tool" aria-label="QR Code Generator Tool">
      <div className="qr-code-controls">
        <div className="qr-field">
          <label className="qr-label" htmlFor="qr-text-input">
            Text or URL
          </label>
          <textarea
            id="qr-text-input"
            className="qr-textarea"
            placeholder="Type or paste text or a URL to encode…"
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
            aria-label="Text or URL to encode as a QR code"
          />
        </div>

        <div className="qr-options">
          <div className="qr-field">
            <label className="qr-label" htmlFor="qr-ec-level">
              Error correction level
            </label>
            <select
              id="qr-ec-level"
              className="qr-select"
              value={errorCorrectionLevel}
              onChange={(event) => setErrorCorrectionLevel(event.target.value)}
              aria-label="Error correction level"
            >
              {ERROR_CORRECTION_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="qr-field">
            <label className="qr-label" htmlFor="qr-module-size">
              Module pixel size: {moduleSize}px
            </label>
            <input
              id="qr-module-size"
              type="range"
              min={MIN_MODULE_SIZE}
              max={MAX_MODULE_SIZE}
              value={moduleSize}
              onChange={(event) => setModuleSize(Number(event.target.value))}
              aria-label="QR code module pixel size"
            />
          </div>
        </div>
      </div>

      <div className="qr-preview">
        <div className="qr-canvas-wrap">
          <canvas ref={canvasRef} className="qr-canvas" hidden={!result.qr} />
          {showPlaceholder && (
            <p className="qr-placeholder">Enter text or a URL above to generate a QR code.</p>
          )}
          {result.error && (
            <p className="qr-error" role="alert">
              ⚠ {result.error}
            </p>
          )}
        </div>

        {result.qr && (
          <div className="qr-meta">
            <span>Version {result.qr.version}</span>
            <span>{result.qr.size}×{result.qr.size} modules</span>
            <span>Level {result.qr.errorCorrectionLevel}</span>
          </div>
        )}

        <div className="qr-actions">
          <button
            type="button"
            className="btn"
            onClick={handleDownload}
            disabled={!result.qr}
            aria-label="Download QR code as PNG"
          >
            Download PNG
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleCopy}
            disabled={!result.qr}
            aria-label="Copy QR code image to clipboard"
          >
            Copy Image
          </button>
        </div>

        <p
          className={
            copyStatus.state === 'error'
              ? 'qr-copy-feedback qr-copy-feedback--error'
              : 'qr-copy-feedback'
          }
          aria-live="polite"
        >
          {copyStatus.state !== 'idle' ? copyStatus.message : ''}
        </p>
      </div>
    </section>
  );
}
