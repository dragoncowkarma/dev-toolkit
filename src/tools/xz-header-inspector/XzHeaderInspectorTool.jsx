import { useRef, useState } from "react";
import { createSampleXz, inspectXz } from "./xz-header-inspector.utils.js";
import "./xz-header-inspector.css";

/** Renders a local-file XZ structural metadata inspector. */
export default function XzHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  function inspect(bytes) {
    try {
      setResult(inspectXz(bytes));
      setError("");
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }
  async function handleFile(event) {
    const file = event.target.files?.[0];
    try {
      if (file) inspect(new Uint8Array(await file.arrayBuffer()));
    } finally {
      event.target.value = "";
    }
  }
  function loadSample(mode) {
    const sample = createSampleXz();
    if (mode === "corrupt") sample[8] ^= 0xff;
    inspect(mode === "truncated" ? sample.slice(0, 16) : sample);
  }
  return (
    <section className="xz-inspector" aria-label="XZ Header Inspector">
      <div className="xz-inspector__actions">
        <label className="btn">
          Open .xz
          <input
            ref={inputRef}
            type="file"
            accept=".xz,application/x-xz"
            onChange={handleFile}
          />
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => loadSample("valid")}
        >
          Load valid sample
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => loadSample("corrupt")}
        >
          Load corrupt sample
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => loadSample("truncated")}
        >
          Load truncated sample
        </button>
      </div>
      <p className="xz-inspector__hint">
        Reads XZ container metadata only; LZMA2 payloads are never decompressed.
      </p>
      {error && (
        <div className="xz-inspector__error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <div className="xz-inspector__result">
          <h2>{result.checkName} check</h2>
          <p>
            {result.blocks.length} block(s), {result.index.records.length} Index
            record(s)
          </p>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}
