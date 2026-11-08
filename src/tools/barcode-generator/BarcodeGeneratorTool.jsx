import { useMemo, useRef, useState } from 'react';
import { encodeCode128, encodeEan13, encodeUpcA } from './barcode.utils.js';
import './barcode.css';

const BARCODE_HEIGHT = 100;
const QUIET_ZONE = 10;
const SYMBOLOGIES = {
  code128: { label: 'Code 128', placeholder: 'Enter ASCII text', encode: encodeCode128 },
  ean13: { label: 'EAN-13', placeholder: 'Enter 12 or 13 digits', encode: encodeEan13 },
  upca: { label: 'UPC-A', placeholder: 'Enter 11 or 12 digits', encode: encodeUpcA },
};

function serializeSvg(svg) {
  const markup = svg.outerHTML;
  const svgStart = '<svg xmlns="http://www.w3.org/2000/svg" ';
  return markup.includes('xmlns=') ? markup : markup.replace('<svg ', svgStart);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Renders an offline Code 128, EAN-13, or UPC-A barcode generator.
 * @returns {React.JSX.Element} The barcode generator UI.
 */
export default function BarcodeGeneratorTool() {
  const [symbology, setSymbology] = useState('code128');
  const [input, setInput] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const svgRef = useRef(null);
  const selectedSymbology = SYMBOLOGIES[symbology];
  const result = useMemo(() => {
    if (!input) return { barcode: null, error: '' };
    try {
      return { barcode: selectedSymbology.encode(input), error: '' };
    } catch (error) {
      return { barcode: null, error: error.message };
    }
  }, [input, selectedSymbology]);
  const error = result.error || downloadError;
  const barcode = result.barcode;
  const viewWidth = barcode ? barcode.modules.length + QUIET_ZONE * 2 : 0;

  function handleSymbologyChange(event) {
    setSymbology(event.target.value);
    setInput('');
    setDownloadError('');
  }

  function handleDownloadSvg() {
    if (!svgRef.current || !barcode) return;
    const svg = serializeSvg(svgRef.current);
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'barcode.svg');
  }

  function handleDownloadPng() {
    if (!svgRef.current || !barcode) return;
    const image = new Image();
    const svgMarkup = serializeSvg(svgRef.current);
    const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(svgBlob);
    image.onload = () => {
      const scale = 3;
      const canvas = document.createElement('canvas');
      canvas.width = viewWidth * scale;
      canvas.height = (BARCODE_HEIGHT + 24) * scale;
      const context = canvas.getContext('2d');
      if (!context) {
        setDownloadError('Your browser could not create a PNG image.');
        URL.revokeObjectURL(objectUrl);
        return;
      }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) downloadBlob(pngBlob, 'barcode.png');
        else setDownloadError('Your browser could not create a PNG image.');
        URL.revokeObjectURL(objectUrl);
      }, 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setDownloadError('Your browser could not create a PNG image.');
    };
    image.src = objectUrl;
  }

  return (
    <section className="barcode-tool" aria-label="Barcode Generator">
      <div className="barcode-tool__controls">
        <div className="barcode-tool__field">
          <label htmlFor="barcode-format">Barcode format</label>
          <select id="barcode-format" value={symbology} onChange={handleSymbologyChange}>
            {Object.entries(SYMBOLOGIES).map(([key, format]) => (
              <option key={key} value={key}>
                {format.label}
              </option>
            ))}
          </select>
        </div>
        <div className="barcode-tool__field barcode-tool__field--input">
          <label htmlFor="barcode-input">Barcode value</label>
          <input
            id="barcode-input"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setDownloadError('');
            }}
            placeholder={selectedSymbology.placeholder}
            spellCheck={false}
          />
        </div>
      </div>

      {error && (
        <div className="barcode-tool__error" role="alert">
          ⚠ {error}
        </div>
      )}

      {barcode && (
        <>
          <div
            className="barcode-tool__preview"
            aria-label={`${selectedSymbology.label} preview`}
          >
            <svg
              ref={svgRef}
              className="barcode-tool__svg"
              xmlns="http://www.w3.org/2000/svg"
              viewBox={`0 0 ${viewWidth} ${BARCODE_HEIGHT + 24}`}
              role="img"
              aria-label={`${selectedSymbology.label} barcode for ${barcode.text}`}
            >
              <rect width={viewWidth} height={BARCODE_HEIGHT + 24} fill="#ffffff" />
              {[...barcode.modules].map(
                (module, index) =>
                  module === '1' && (
                    <rect
                      key={index}
                      x={index + QUIET_ZONE}
                      y="0"
                      width="1"
                      height={BARCODE_HEIGHT}
                    />
                  )
              )}
              <text
                x={viewWidth / 2}
                y={BARCODE_HEIGHT + 17}
                textAnchor="middle"
                fontFamily="monospace"
                fontSize="14"
              >
                {barcode.text}
              </text>
            </svg>
          </div>
          <div className="barcode-tool__actions">
            <button type="button" onClick={handleDownloadPng}>
              Download PNG
            </button>
            <button type="button" onClick={handleDownloadSvg}>
              Download SVG
            </button>
          </div>
        </>
      )}
    </section>
  );
}
