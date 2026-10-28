import { useEffect, useMemo, useRef, useState } from 'react';
import {
  QrCapacityError,
  decodeQrFile,
  drawQrToCanvas,
  generateQrCode,
} from './qrCode.utils.js';
import './qrCode.css';

const ERROR_CORRECTION_OPTIONS = [
  ['L', 'L — Low (~7%)'],
  ['M', 'M — Medium (~15%)'],
  ['Q', 'Q — Quartile (~25%)'],
  ['H', 'H — High (~30%)'],
];

const MODES = {
  GENERATE: 'generate',
  DECODE: 'decode',
};

const MIN_MODULE_SIZE = 2;
const MAX_MODULE_SIZE = 16;
const DEFAULT_MODULE_SIZE = 8;

/**
 * Renders an in-browser QR code generator and scanner. Text and QR images are
 * processed locally; no content is uploaded while generating or decoding.
 *
 * @returns {React.JSX.Element} The QR code tool UI.
 */
export default function QrCodeTool() {
  const [mode, setMode] = useState(MODES.GENERATE);
  const [text, setText] = useState('');
  const [errorCorrectionLevel, setErrorCorrectionLevel] = useState('M');
  const [moduleSize, setModuleSize] = useState(DEFAULT_MODULE_SIZE);
  const [copyStatus, setCopyStatus] = useState({ state: 'idle', message: '' });
  const [decodedText, setDecodedText] = useState(null);
  const [decodeError, setDecodeError] = useState('');
  const [decodeStatus, setDecodeStatus] = useState({ state: 'idle', message: '' });
  const [decodedCopyStatus, setDecodedCopyStatus] = useState({ state: 'idle', message: '' });
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const decodeRequestRef = useRef(0);

  const result = useMemo(() => {
    if (text === '') return { qr: null, error: '' };
    try {
      return { qr: generateQrCode(text, { errorCorrectionLevel }), error: '' };
    } catch (error) {
      if (error instanceof QrCapacityError) {
        return { qr: null, error: error.message };
      }
      return { qr: null, error: 'Could not generate a QR code for this input.' };
    }
  }, [text, errorCorrectionLevel]);

  // Draw the generated matrix whenever it or the pixel scale changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!result.qr) {
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    drawQrToCanvas(canvas, result.qr.matrix, { moduleSize });
  }, [result.qr, moduleSize]);

  useEffect(() => {
    if (copyStatus.state === 'idle') return undefined;
    const timer = setTimeout(() => setCopyStatus({ state: 'idle', message: '' }), 2500);
    return () => clearTimeout(timer);
  }, [copyStatus.state]);

  useEffect(() => {
    if (decodedCopyStatus.state === 'idle') return undefined;
    const timer = setTimeout(() => {
      setDecodedCopyStatus({ state: 'idle', message: '' });
    }, 2500);
    return () => clearTimeout(timer);
  }, [decodedCopyStatus.state]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    decodeRequestRef.current += 1;
    setMode(nextMode);
    setDecodedText(null);
    setDecodeError('');
    setDecodeStatus({ state: 'idle', message: '' });
    setDecodedCopyStatus({ state: 'idle', message: '' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function clearDecodeResult() {
    setDecodedText(null);
    setDecodeError('');
    setDecodeStatus({ state: 'idle', message: '' });
    setDecodedCopyStatus({ state: 'idle', message: '' });
  }

  async function handleDecodeFile(file) {
    if (!file) return;
    const requestId = (decodeRequestRef.current += 1);
    clearDecodeResult();
    setDecodeStatus({ state: 'loading', message: 'Reading the QR code image…' });

    try {
      const decoded = await decodeQrFile(file);
      if (decodeRequestRef.current !== requestId) return;
      setDecodedText(decoded);
      setDecodeStatus({ state: 'success', message: 'QR code decoded successfully.' });
    } catch (error) {
      if (decodeRequestRef.current !== requestId) return;
      const message = error instanceof Error
        ? error.message
        : 'Could not decode this image. It may be corrupted or unreadable.';
      setDecodedText(null);
      setDecodeError(message);
      setDecodeStatus({ state: 'idle', message: '' });
    }
  }

  function handleFileChange(event) {
    const [file] = event.target.files ?? [];
    event.target.value = '';
    handleDecodeFile(file);
  }

  function handlePaste(event) {
    const imageItem = Array.from(event.clipboardData?.items ?? []).find(
      (item) => item.kind === 'file' && item.type.startsWith('image/'),
    );
    const imageFile = imageItem?.getAsFile();
    if (!imageFile) {
      clearDecodeResult();
      setDecodeError(
        'Clipboard does not contain an image. Paste an image that contains a QR code.',
      );
      return;
    }
    event.preventDefault();
    handleDecodeFile(imageFile);
  }

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

  async function handleGeneratedCopy() {
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
          } catch (error) {
            reject(error);
          }
        }, 'image/png');
      });
      setCopyStatus({ state: 'success', message: 'QR code image copied to clipboard.' });
    } catch {
      setCopyStatus({ state: 'error', message: 'Failed to copy the QR code image.' });
    }
  }

  async function handleDecodedTextCopy() {
    if (decodedText === null) return;
    try {
      await navigator.clipboard.writeText(decodedText);
      setDecodedCopyStatus({ state: 'success', message: 'Decoded text copied to clipboard.' });
    } catch {
      setDecodedCopyStatus({ state: 'error', message: 'Failed to copy the decoded text.' });
    }
  }

  const showPlaceholder = text === '' && !result.error;

  return (
    <section className="qr-code-tool" aria-label="QR Code Generator and Scanner Tool">
      <div className="qr-mode-toggle" role="group" aria-label="QR code mode">
        <button
          type="button"
          className={mode === MODES.GENERATE ? 'qr-mode-btn active' : 'qr-mode-btn'}
          aria-pressed={mode === MODES.GENERATE}
          onClick={() => handleModeChange(MODES.GENERATE)}
        >
          Generate
        </button>
        <button
          type="button"
          className={mode === MODES.DECODE ? 'qr-mode-btn active' : 'qr-mode-btn'}
          aria-pressed={mode === MODES.DECODE}
          onClick={() => handleModeChange(MODES.DECODE)}
        >
          Decode image
        </button>
      </div>

      {mode === MODES.GENERATE ? (
        <>
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
                onClick={handleGeneratedCopy}
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
              role="status"
              aria-live="polite"
            >
              {copyStatus.state !== 'idle' ? copyStatus.message : ''}
            </p>
          </div>
        </>
      ) : (
        <div className="qr-decode-panel" aria-busy={decodeStatus.state === 'loading'}>
          <div className="qr-field">
            <label className="qr-label" htmlFor="qr-image-input">
              QR code image
            </label>
            <input
              ref={fileInputRef}
              id="qr-image-input"
              className="qr-image-input"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              aria-label="Upload a QR code image"
            />
          </div>

          <div
            className="qr-paste-target"
            role="region"
            tabIndex="0"
            aria-label="Paste a QR code image"
            onPaste={handlePaste}
          >
            Click here, then paste an image from your clipboard.
          </div>

          {decodeError && (
            <p className="qr-error" role="alert">
              ⚠ {decodeError}
            </p>
          )}

          <div className="qr-decoded-result">
            <div className="qr-decoded-heading">
              <label className="qr-label" htmlFor="qr-decoded-text">
                Decoded text
              </label>
              <button
                type="button"
                className="btn"
                onClick={handleDecodedTextCopy}
                disabled={decodedText === null}
                aria-label="Copy decoded text to clipboard"
              >
                Copy text
              </button>
            </div>
            <textarea
              id="qr-decoded-text"
              className="qr-textarea qr-decoded-text"
              value={decodedText ?? ''}
              readOnly
              placeholder="Decoded QR text will appear here…"
              aria-label="Decoded QR text"
              spellCheck={false}
            />
          </div>

          <p
            className={
              decodedCopyStatus.state === 'error'
                ? 'qr-copy-feedback qr-copy-feedback--error'
                : 'qr-copy-feedback'
            }
            role="status"
            aria-live="polite"
          >
            {decodedCopyStatus.state !== 'idle'
              ? decodedCopyStatus.message
              : decodeStatus.message}
          </p>
        </div>
      )}
    </section>
  );
}
