import { useRef, useState } from 'react';
import { decodeBarcodeFromImageData } from './barcode-scanner.utils.js';
import './barcode-scanner.css';

function readImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The image could not be read.')); };
    image.src = url;
  });
}

/** Renders a client-side barcode image scanner. */
export default function BarcodeScannerTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  async function scan(file) {
    if (!file?.type.startsWith('image/')) { setError('Please choose a PNG or JPEG image.'); return; }
    try {
      const image = await readImage(file);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const decoded = decodeBarcodeFromImageData(context.getImageData(0, 0, canvas.width, canvas.height));
      if (!decoded) throw new Error('No supported barcode was found in this image.');
      setResult(decoded); setError('');
    } catch (scanError) { setResult(null); setError(scanError.message); }
  }

  function handleDrop(event) { event.preventDefault(); setIsDragging(false); scan(event.dataTransfer.files?.[0]); }
  function handlePaste(event) { const file = [...event.clipboardData.items].find((item) => item.type.startsWith('image/'))?.getAsFile(); if (file) scan(file); }

  return <section className="barcode-scanner" aria-label="Barcode Scanner" onPaste={handlePaste}>
    <input ref={inputRef} className="barcode-scanner__input" type="file" accept="image/png,image/jpeg" aria-label="Upload barcode image" onChange={(event) => scan(event.target.files?.[0])} />
    <div className={`barcode-scanner__dropzone ${isDragging ? 'is-dragging' : ''}`} role="button" tabIndex="0" onClick={() => inputRef.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}>
      <strong>Upload, paste, or drop a barcode image</strong><span>PNG and JPEG images are decoded locally in your browser.</span>
    </div>
    {error && <div className="barcode-scanner__error" role="alert">{error}</div>}
    {result && <div className="barcode-scanner__result" aria-live="polite"><span>Decoded value</span><output>{result.value}</output><dl><div><dt>Symbology</dt><dd>{result.symbology}</dd></div><div><dt>Checksum</dt><dd className="barcode-scanner__valid">Valid</dd></div></dl></div>}
  </section>;
}
