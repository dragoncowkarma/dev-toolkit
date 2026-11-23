import { useRef, useState } from 'react';
import { parseFits } from './fits.utils.js';
import './fits.css';

/** Inspect FITS headers entirely within the browser. */
export default function FitsHeaderInspectorTool() {
  const [hdus, setHdus] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const input = useRef(null);

  async function selectFile(event) {
    const id = ++request.current;
    const file = event.target.files?.[0];
    setHdus([]);
    setError('');
    setName(file?.name ?? '');
    setLoading(Boolean(file));
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      if (request.current !== id) return;
      setHdus(parseFits(buffer));
    } catch (err) {
      if (request.current !== id) return;
      setError(err.message || 'Failed to read the selected file.');
    } finally {
      if (request.current === id) setLoading(false);
    }
  }

  function clear() {
    request.current += 1;
    if (input.current) input.current.value = '';
    setHdus([]);
    setName('');
    setError('');
    setLoading(false);
  }

  return (
    <section className="fits-tool" aria-label="FITS Header Inspector">
      <p>Inspect FITS headers locally in your browser. Files are never uploaded.</p>
      <div className="fits-actions">
        <label htmlFor="fits-file">Choose a FITS file</label>
        <input
          id="fits-file" ref={input} type="file" accept=".fits,.fit,.fts" onChange={selectFile}
        />
        <button type="button" onClick={clear}>Clear</button>
      </div>
      {name && <p>File: {name}</p>}
      {loading && <p role="status">Reading file…</p>}
      {error && <p className="fits-error" role="alert">{error}</p>}
      {hdus.map((hdu, index) => (
        <section className="fits-hdu" key={hdu.headerOffset}>
          <h2>HDU {index}: {index === 0 ? 'Primary' : hdu.values.XTENSION}</h2>
          <p>Header offset: {hdu.headerOffset} bytes · Data: {hdu.dataSize} bytes</p>
          <div className="fits-table-wrap">
            <table>
              <thead><tr><th>Keyword</th><th>Value</th><th>Comment</th></tr></thead>
              <tbody>{hdu.cards.map((card, cardIndex) => (
                <tr key={cardIndex}>
                  <td>{card.keyword}</td><td>{String(card.value)}</td><td>{card.comment}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ))}
    </section>
  );
}
