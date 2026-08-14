import { useState } from "react";
import {
  applyJsonPatch,
  generateJsonPatch,
  resolveJsonPointer,
} from "./jsonPatch.utils.js";
import "./jsonPatch.css";

const SAMPLE_DOCUMENT =
  '{\n  "items": ["first", "second"],\n  "status": "draft"\n}';
const SAMPLE_PATCH =
  '[\n  { "op": "add", "path": "/items/-", "value": "third" },\n' +
  '  { "op": "replace", "path": "/status", "value": "published" }\n]';
const SAMPLE_TARGET =
  '{\n  "items": ["first", "second", "third"],\n  "status": "published"\n}';

function parseInput(input, label) {
  try {
    return { value: JSON.parse(input), error: null };
  } catch (error) {
    return { value: null, error: `Invalid ${label} JSON: ${error.message}` };
  }
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

/** Renders a JSON Pointer resolver and atomic JSON Patch workbench. */
export default function JsonPatchTool() {
  const [mode, setMode] = useState("apply");
  const [documentInput, setDocumentInput] = useState("");
  const [patchInput, setPatchInput] = useState("");
  const [pointerInput, setPointerInput] = useState("");
  const [targetInput, setTargetInput] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  function resetOutput() {
    setResult("");
    setError("");
  }

  function loadSample() {
    setDocumentInput(SAMPLE_DOCUMENT);
    setPatchInput(SAMPLE_PATCH);
    setTargetInput(SAMPLE_TARGET);
    setPointerInput("/items/0");
    resetOutput();
  }

  function applyPatch() {
    resetOutput();
    const document = parseInput(documentInput, "document");
    const patch = parseInput(patchInput, "patch");
    if (document.error || patch.error) {
      setError(document.error || patch.error);
      return;
    }
    const outcome = applyJsonPatch(document.value, patch.value);
    if (!outcome.ok) {
      setError(`Operation ${outcome.error.index}: ${outcome.error.message}`);
      return;
    }
    setResult(formatJson(outcome.document));
  }

  function resolvePointer() {
    resetOutput();
    const document = parseInput(documentInput, "document");
    if (document.error) {
      setError(document.error);
      return;
    }
    const outcome = resolveJsonPointer(document.value, pointerInput);
    if (outcome.error) {
      setError(outcome.error.message);
      return;
    }
    if (!outcome.found) {
      setError(
        "The pointer is valid but does not resolve to a document location.",
      );
      return;
    }
    setResult(formatJson(outcome.value));
  }

  function generatePatch() {
    resetOutput();
    const source = parseInput(documentInput, "source");
    const target = parseInput(targetInput, "target");
    if (source.error || target.error) {
      setError(source.error || target.error);
      return;
    }
    setResult(formatJson(generateJsonPatch(source.value, target.value)));
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    resetOutput();
  }

  return (
    <section className="json-patch-tool" aria-labelledby="json-patch-title">
      <header className="json-patch-tool__intro">
        <p className="json-patch-tool__eyebrow">JSON</p>
        <h2 id="json-patch-title">JSON Patch</h2>
        <p>
          Resolve RFC 6901 pointers, apply RFC 6902 patches atomically, or
          generate a patch.
        </p>
      </header>

      <div className="json-patch-tool__controls" aria-label="JSON Patch modes">
        <button
          type="button"
          aria-pressed={mode === "apply"}
          onClick={() => switchMode("apply")}
        >
          Apply and resolve
        </button>
        <button
          type="button"
          aria-label="Generate patch mode"
          aria-pressed={mode === "generate"}
          onClick={() => switchMode("generate")}
        >
          Generate patch
        </button>
        <button type="button" onClick={loadSample}>
          Load sample
        </button>
      </div>

      <div className="json-patch-tool__inputs">
        <label className="json-patch-tool__pane" htmlFor="json-patch-document">
          {mode === "generate" ? "Source JSON" : "Document JSON"}
          <textarea
            id="json-patch-document"
            value={documentInput}
            onChange={(event) => setDocumentInput(event.target.value)}
            placeholder="Paste a JSON document"
            spellCheck="false"
          />
        </label>
        {mode === "generate" ? (
          <label className="json-patch-tool__pane" htmlFor="json-patch-target">
            Target JSON
            <textarea
              id="json-patch-target"
              value={targetInput}
              onChange={(event) => setTargetInput(event.target.value)}
              placeholder="Paste the desired JSON document"
              spellCheck="false"
            />
          </label>
        ) : (
          <label
            className="json-patch-tool__pane"
            htmlFor="json-patch-operations"
          >
            Patch JSON
            <textarea
              id="json-patch-operations"
              value={patchInput}
              onChange={(event) => setPatchInput(event.target.value)}
              placeholder="Paste an application/json-patch+json operation array"
              spellCheck="false"
            />
          </label>
        )}
      </div>

      {mode === "apply" && (
        <label
          className="json-patch-tool__pointer"
          htmlFor="json-patch-pointer"
        >
          JSON Pointer
          <textarea
            id="json-patch-pointer"
            value={pointerInput}
            onChange={(event) => setPointerInput(event.target.value)}
            placeholder="/items/0"
            rows="1"
            spellCheck="false"
          />
        </label>
      )}

      <div className="json-patch-tool__actions">
        {mode === "generate" ? (
          <button type="button" onClick={generatePatch}>
            Generate patch
          </button>
        ) : (
          <>
            <button type="button" onClick={applyPatch}>
              Apply patch
            </button>
            <button type="button" onClick={resolvePointer}>
              Resolve pointer
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="json-patch-tool__error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <section
          className="json-patch-tool__result"
          aria-labelledby="json-patch-result-title"
        >
          <h3 id="json-patch-result-title">Result</h3>
          <pre>{result}</pre>
        </section>
      )}
    </section>
  );
}
