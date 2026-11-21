import { useRef, useState } from "react";
import {
  base64ToBytes,
  parseEbmlHeader,
} from "./ebml-header-inspector.utils.js";
import "./ebml-header-inspector.css";

function ResultTable({ result }) {
  return (
    <div className="ebml-results" aria-label="Parsed EBML metadata">
      <h3>EBML header</h3>
      <dl>
        <dt>EBML version</dt>
        <dd>{result.ebml.version ?? "Not present"}</dd>
        <dt>EBML read version</dt>
        <dd>{result.ebml.readVersion ?? "Not present"}</dd>
        <dt>DocType</dt>
        <dd>{result.ebml.docType ?? "Not present"}</dd>
        <dt>DocType version</dt>
        <dd>{result.ebml.docTypeVersion ?? "Not present"}</dd>
      </dl>
      <h3>Segment info</h3>
      <dl>
        <dt>Timecode scale</dt>
        <dd>{result.segment.info.timecodeScale ?? "Not present"} ns</dd>
        <dt>Duration</dt>
        <dd>{result.segment.info.duration ?? "Not present"}</dd>
        <dt>Muxing app</dt>
        <dd>{result.segment.info.muxingApp ?? "Not present"}</dd>
        <dt>Writing app</dt>
        <dd>{result.segment.info.writingApp ?? "Not present"}</dd>
      </dl>
      <h3>Tracks ({result.segment.tracks.length})</h3>
      {result.segment.tracks.length === 0 ? (
        <p>No track entries found.</p>
      ) : (
        <div className="ebml-track-list">
          {result.segment.tracks.map((track, index) => (
            <article
              className="ebml-track"
              key={`${track.number ?? index}-${track.codecId ?? ""}`}
            >
              <strong>
                Track {track.number ?? index + 1}: {track.type ?? "Unknown"}
              </strong>
              <span>Codec: {track.codecId ?? "Not present"}</span>
              {track.width && (
                <span>
                  Video: {track.width} × {track.height ?? "?"}
                </span>
              )}
              {track.sampleRate && (
                <span>
                  Audio: {track.sampleRate} Hz, {track.channels ?? "?"} channels
                </span>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/** Renders a client-side Matroska/WebM EBML header inspector. */
export default function EbmlHeaderInspectorTool() {
  const [base64, setBase64] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  function inspect(bytes) {
    const parsed = parseEbmlHeader(bytes);
    setResult(parsed.status === "decoded" ? parsed : null);
    setError(parsed.status === "undecoded" ? parsed.error : "");
  }

  function handleBase64Inspect() {
    try {
      inspect(base64ToBytes(base64));
    } catch (inputError) {
      setResult(null);
      setError(inputError.message);
    }
  }
  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    inspect(new Uint8Array(await file.arrayBuffer()));
  }
  function handleClear() {
    setBase64("");
    setResult(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <section className="ebml-tool" aria-label="EBML Header Inspector">
      <p>
        Inspect Matroska (.mkv) and WebM (.webm) headers locally in your
        browser.
      </p>
      <div className="ebml-actions">
        <label className="ebml-button">
          Choose file
          <input
            ref={fileInputRef}
            type="file"
            accept=".mkv,.webm,video/webm,video/x-matroska"
            onChange={handleFileChange}
            aria-describedby={error ? "ebml-error" : undefined}
          />
        </label>
        <button
          type="button"
          className="ebml-button"
          onClick={handleBase64Inspect}
          disabled={!base64.trim()}
        >
          Inspect Base64
        </button>
        <button type="button" className="ebml-button" onClick={handleClear}>
          Clear
        </button>
      </div>
      <label htmlFor="ebml-base64">Base64 file data</label>
      <textarea
        id="ebml-base64"
        value={base64}
        onChange={(event) => setBase64(event.target.value)}
        placeholder="Paste Base64-encoded Matroska or WebM data…"
        spellCheck={false}
        aria-describedby={error ? "ebml-error" : undefined}
      />
      {error && (
        <div id="ebml-error" className="ebml-error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <div role="status" aria-live="polite">
          <ResultTable result={result} />
        </div>
      )}
    </section>
  );
}
