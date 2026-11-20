import { useRef, useState } from "react";
import { decodeBase64, parseSfnt } from "./font-header.utils.js";
import "./font-header-inspector.css";

function dateValue(value) {
  return value.iso ?? `${value.seconds} seconds since 1904-01-01`;
}

/** Renders a client-side SFNT header inspector for TTF and OTF files. */
export default function FontHeaderInspectorTool() {
  const [base64, setBase64] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  function inspect(bytes) {
    try {
      setResult(parseSfnt(bytes));
      setError("");
    } catch (inspectionError) {
      setResult(null);
      setError(inspectionError.message);
    }
  }

  function inspectBase64() {
    try {
      inspect(decodeBase64(base64));
    } catch (inspectionError) {
      setResult(null);
      setError(inspectionError.message);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      inspect(await file.arrayBuffer());
    } catch {
      setResult(null);
      setError("File upload: failed to read the selected font file.");
    }
  }

  function clear() {
    setBase64("");
    setResult(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <section
      className="font-header-inspector"
      aria-label="TrueType and OpenType font inspector"
    >
      <div className="font-header-inspector__actions">
        <label className="font-header-inspector__button">
          Upload .ttf or .otf
          <input
            ref={fileInputRef}
            type="file"
            accept=".ttf,.otf,font/ttf,font/otf"
            onChange={handleFileChange}
            aria-label="Upload a TrueType or OpenType font"
          />
        </label>
        <button
          type="button"
          className="font-header-inspector__button"
          onClick={inspectBase64}
        >
          Inspect Base64
        </button>
        <button
          type="button"
          className="font-header-inspector__button"
          onClick={clear}
        >
          Clear
        </button>
      </div>
      <label htmlFor="font-base64" className="font-header-inspector__label">
        Base64 font data
      </label>
      <textarea
        id="font-base64"
        value={base64}
        onChange={(event) => setBase64(event.target.value)}
        placeholder="Paste a Base64-encoded .ttf or .otf file…"
        spellCheck={false}
      />
      {error && (
        <div className="font-header-inspector__error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <>
          <section aria-labelledby="font-offset-table-heading">
            <h2 id="font-offset-table-heading">SFNT offset table</h2>
            <dl className="font-header-inspector__details">
              <div>
                <dt>Flavor</dt>
                <dd>
                  {result.sfntVersion.hex} — {result.sfntVersion.label}
                </dd>
              </div>
              <div>
                <dt>File size</dt>
                <dd>{result.fileSize} bytes</dd>
              </div>
              <div>
                <dt>Tables</dt>
                <dd>{result.numTables}</dd>
              </div>
              <div>
                <dt>Search range</dt>
                <dd>{result.searchRange}</dd>
              </div>
              <div>
                <dt>Entry selector</dt>
                <dd>{result.entrySelector}</dd>
              </div>
              <div>
                <dt>Range shift</dt>
                <dd>{result.rangeShift}</dd>
              </div>
            </dl>
          </section>
          {(result.head || result.maxp) && (
            <section aria-labelledby="font-key-tables-heading">
              <h2 id="font-key-tables-heading">Key tables</h2>
              <dl className="font-header-inspector__details">
                {result.head && (
                  <>
                    <div>
                      <dt>head units per em</dt>
                      <dd>{result.head.unitsPerEm}</dd>
                    </div>
                    <div>
                      <dt>head created</dt>
                      <dd>{dateValue(result.head.created)}</dd>
                    </div>
                    <div>
                      <dt>head modified</dt>
                      <dd>{dateValue(result.head.modified)}</dd>
                    </div>
                    <div>
                      <dt>head indexToLocFormat</dt>
                      <dd>{result.head.indexToLocFormat}</dd>
                    </div>
                  </>
                )}
                {result.maxp && (
                  <div>
                    <dt>maxp glyphs</dt>
                    <dd>{result.maxp.numGlyphs}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}
          <section aria-labelledby="font-directory-heading">
            <h2 id="font-directory-heading">Table directory</h2>
            <div className="font-header-inspector__table-wrap" tabIndex="0">
              <table aria-labelledby="font-directory-heading">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Tag</th>
                    <th scope="col">Known use</th>
                    <th scope="col">Checksum</th>
                    <th scope="col">Offset</th>
                    <th scope="col">Length</th>
                    <th scope="col">In bounds</th>
                  </tr>
                </thead>
                <tbody>
                  {result.tables.map((table) => (
                    <tr key={`${table.index}-${table.tag}`}>
                      <th scope="row">{table.index}</th>
                      <td>
                        <code>{table.tag}</code>
                      </td>
                      <td>{table.label ?? "—"}</td>
                      <td>0x{table.checksum.toString(16).padStart(8, "0")}</td>
                      <td>{table.offset}</td>
                      <td>{table.length}</td>
                      <td>{table.inBounds ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
