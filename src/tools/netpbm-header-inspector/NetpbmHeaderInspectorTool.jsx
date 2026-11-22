import { useRef, useState } from "react";
import { base64ToBytes, inspectNetpbmHeader } from "./netpbm.utils.js";
import "./netpbm-header-inspector.css";

const FIELD_LABELS = {
  magic: "Magic number",
  variant: "Variant",
  encoding: "Encoding",
  width: "Width",
  height: "Height",
  maxval: "MAXVAL",
  channels: "Channels",
  bitsPerSample: "Bits per sample",
  tupleType: "Tuple type",
  headerByteLength: "Header bytes",
  expectedPayloadSize: "Expected raw payload",
  availablePayloadSize: "Available payload bytes",
};

function formatValue(key, value) {
  if (value === null || value === undefined || value === "")
    return "Unavailable";
  return key.includes("Size") || key === "headerByteLength"
    ? `${value} bytes`
    : String(value);
}

/** Renders a client-side Netpbm header inspector. @returns {React.JSX.Element} Tool UI. */
export default function NetpbmHeaderInspectorTool() {
  const [base64, setBase64] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  function inspect(bytes) {
    const next = inspectNetpbmHeader(bytes);
    setResult(next.fields);
    setError(next.error);
  }

  async function readFile(file) {
    if (!file) return;
    try {
      inspect(new Uint8Array(await file.arrayBuffer()));
      setBase64("");
    } catch {
      setResult(null);
      setError("The selected file could not be read.");
    }
  }

  function handleBase64Change(event) {
    const value = event.target.value;
    setBase64(value);
    if (!value.trim()) {
      setResult(null);
      setError("");
      return;
    }
    try {
      inspect(base64ToBytes(value));
    } catch (caughtError) {
      setResult(null);
      setError(caughtError.message);
    }
  }

  return (
    <section className="netpbm-inspector" aria-label="Netpbm header inspector">
      <input
        ref={inputRef}
        className="netpbm-inspector__input"
        type="file"
        accept=".pbm,.pgm,.ppm,.pam,image/*"
        onChange={(event) => readFile(event.target.files?.[0])}
        aria-label="Choose a Netpbm image"
      />
      <div
        className={`netpbm-inspector__dropzone${dragging ? " is-dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          readFile(event.dataTransfer.files?.[0]);
        }}
      >
        <p>Drop a PBM, PGM, PPM, or PAM image here.</p>
        <button
          type="button"
          className="netpbm-inspector__button"
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </button>
      </div>
      <label className="netpbm-inspector__label" htmlFor="netpbm-base64">
        Or paste Base64 image data
      </label>
      <textarea
        id="netpbm-base64"
        className="netpbm-inspector__textarea"
        value={base64}
        onChange={handleBase64Change}
        placeholder="Paste Base64-encoded Netpbm data…"
        spellCheck={false}
      />
      {error && (
        <div className="netpbm-inspector__error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <dl className="netpbm-inspector__metadata">
          {Object.entries(result).map(([key, value]) => (
            <div key={key}>
              <dt>{FIELD_LABELS[key]}</dt>
              <dd>{formatValue(key, value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
