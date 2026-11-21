import { useRef, useState } from 'react';
import { parseAvif } from './avif.utils.js';
import './avif-header-inspector.css';

/** Renders a browser-only AVIF/AVIS container inspector. */
export default function AvifHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setResult(parseAvif(await file.arrayBuffer()));
      setError('');
    } catch (parseFailure) {
      setResult(null);
      setError(parseFailure.message);
    }
  }

  function handleClear() {
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return <section className="avif-inspector" aria-label="AVIF Header Inspector">
    <div className="avif-inspector__toolbar">
      <label className="avif-inspector__button">
        Choose AVIF file
        <input ref={fileInputRef} type="file" accept="image/avif,.avif"
          onChange={handleFileChange} />
      </label>
      <button type="button" className="avif-inspector__button" onClick={handleClear}>
        Clear
      </button>
    </div>
    <p className="avif-inspector__privacy">
      Files are parsed locally in your browser and are never uploaded.
    </p>
    {error && <div className="avif-inspector__error" role="alert">{error}</div>}
    {result && <div className="avif-inspector__results">
      <div className="avif-inspector__summary">
        <h2>{result.summary.isSequence ? 'AVIF image sequence' : 'AVIF still image'}</h2>
        <p>Brand: <strong>{result.majorBrand}</strong> · Minor version: {result.minorVersion}</p>
        <p>Dimensions: {result.summary.width
          ? `${result.summary.width} × ${result.summary.height}` : 'Not found'}
        {' · '}Bit depth: {result.summary.bitDepth ?? 'Not found'}
        {' · '}Alpha: {result.summary.hasAlpha ? 'Present' : 'Not found'}</p>
        <p>Compatible brands: {result.compatibleBrands.join(', ') || 'None'}</p>
      </div>
      <h2>Top-level boxes</h2>
      <ul className="avif-inspector__list">
        {result.boxes.map((box) => <li key={`${box.offset}-${box.type}`}>
          <code>{box.type}</code> — offset {box.offset}, {box.size} bytes
        </li>)}
      </ul>
      {result.handlerType && <p>Meta handler: <code>{result.handlerType}</code></p>}
      <h2>Items</h2>
      <ul className="avif-inspector__list">
        {result.items.map((item) => <li key={item.itemId}>
          <code>{item.itemType}</code> item {item.itemId}{item.name ? ` (${item.name})` : ''}
          {item.locations.length ? ` — ${item.locations.map((extent) =>
            `offset ${extent.offset}, ${extent.length} bytes`).join('; ')}` : ''}
        </li>)}
      </ul>
    </div>}
  </section>;
}
