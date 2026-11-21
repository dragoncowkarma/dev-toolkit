import { useRef, useState } from 'react';
import { inspectTiff } from './tiff-header-inspector.utils.js';
import './tiff-header-inspector.css';

/** Renders a local-only TIFF header and IFD inspector. */
export default function TiffHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(inspectTiff(await file.arrayBuffer()));
  }

  function handleClear() {
    setResult(null);
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="tiff-inspector" aria-label="TIFF Header Inspector">
      <div className="tiff-inspector__toolbar">
        <label className="tiff-inspector__upload btn">
          Choose TIFF file
          <input
            ref={inputRef}
            type="file"
            accept=".tif,.tiff,image/tiff"
            onChange={handleFileChange}
            aria-label="Choose a TIFF file to inspect"
          />
        </label>
        {result && (
          <button type="button" className="btn" onClick={handleClear}>Clear</button>
        )}
      </div>
      <p className="tiff-inspector__privacy">
        Files are parsed locally in your browser and never uploaded.
      </p>
      {fileName && <p className="tiff-inspector__filename">Inspecting: {fileName}</p>}
      {result?.error && (
        <div className="tiff-inspector__error" role="alert">{result.error}</div>
      )}
      {result?.pages && <div className="tiff-inspector__results">
        <p>
          Byte order: <strong>{result.byteOrder}</strong> · Pages:
          {' '}<strong>{result.pages.length}</strong>
        </p>
        {result.pages.map((page, pageIndex) => <section
          className="tiff-inspector__page"
          key={pageIndex}
        >
          <h2>Image File Directory {pageIndex + 1}</h2>
          <div className="tiff-inspector__table-wrap"><table>
            <thead><tr><th>Tag</th><th>Type</th><th>Value</th></tr></thead>
            <tbody>{page.tags.map((tag) => <tr key={`${tag.id}-${tag.name}`}>
              <td>{tag.name} <span>({tag.id})</span></td><td>{tag.type}</td>
              <td>{tag.value}{tag.label ? ` (${tag.label})` : ''}</td>
            </tr>)}</tbody>
          </table></div>
        </section>)}
      </div>}
    </section>
  );
}
