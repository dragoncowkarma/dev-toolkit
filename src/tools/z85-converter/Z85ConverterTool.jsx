import { useEffect, useState } from "react";
import { useCopyFeedback } from "../../hooks/useCopyFeedback.js";
import {
  decodeZ85,
  encodeZ85,
  formatByteOutput,
  padBytesToZ85Block,
  parseByteInput,
} from "./z85Converter.utils.js";
import "./z85Converter.css";

const SAMPLE_BYTES = "86 4F D2 6F B5 59 F7 5B";

/** Renders a client-side Z85 encoder and decoder. */
export default function Z85ConverterTool() {
  const [mode, setMode] = useState("encode");
  const [inputType, setInputType] = useState("text");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [padInput, setPadInput] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [copied, showCopied] = useCopyFeedback({
    initialValue: false,
    resetValue: false,
  });

  useEffect(() => {
    if (!input) {
      setOutput("");
      setError("");
      return;
    }
    try {
      if (mode === "encode") {
        const bytes =
          inputType === "text"
            ? new TextEncoder().encode(input)
            : parseByteInput(input);
        const aligned = padInput ? padBytesToZ85Block(bytes) : bytes;
        setOutput(encodeZ85(aligned));
      } else {
        const decoded = decodeZ85(input);
        setOutput(
          inputType === "text"
            ? new TextDecoder("utf-8", { fatal: true }).decode(decoded)
            : formatByteOutput(decoded),
        );
      }
      setError("");
    } catch (conversionError) {
      setOutput("");
      setError(conversionError.message);
    }
  }, [input, inputType, mode, padInput]);

  function changeMode(nextMode) {
    setMode(nextMode);
    setInput("");
    setOutput("");
    setError("");
  }

  function useSample() {
    setMode("encode");
    setInputType("bytes");
    setPadInput(false);
    setInput(SAMPLE_BYTES);
  }

  async function copyOutput() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopyError("");
      showCopied(true);
    } catch {
      setCopyError("Failed to copy to clipboard.");
    }
  }

  const inputLabel =
    mode === "encode" ? (inputType === "text" ? "Text" : "Hex bytes") : "Z85";
  const outputLabel =
    mode === "encode" ? "Z85" : inputType === "text" ? "Text" : "Hex bytes";

  return (
    <section className="z85-tool" aria-label="Z85 Encoder and Decoder Tool">
      <div className="z85-tool__toolbar">
        <div
          className="z85-tool__toggle"
          role="group"
          aria-label="Conversion mode"
        >
          {["encode", "decode"].map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={mode === value}
              className={`z85-tool__mode ${mode === value ? "z85-tool__mode--active" : ""}`}
              onClick={() => changeMode(value)}
            >
              {value === "encode" ? "Encode" : "Decode"}
            </button>
          ))}
        </div>
        <div className="z85-tool__actions">
          <button
            type="button"
            className="z85-tool__button"
            onClick={useSample}
          >
            Use sample
          </button>
          <button
            type="button"
            className="z85-tool__button"
            onClick={() => setInput("")}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="z85-tool__options">
        <label>
          <input
            type="radio"
            name="z85-input-type"
            checked={inputType === "text"}
            onChange={() => setInputType("text")}
          />{" "}
          Text
        </label>
        <label>
          <input
            type="radio"
            name="z85-input-type"
            checked={inputType === "bytes"}
            onChange={() => setInputType("bytes")}
          />{" "}
          Bytes (hex)
        </label>
        {mode === "encode" && (
          <label>
            <input
              type="checkbox"
              checked={padInput}
              onChange={(event) => setPadInput(event.target.checked)}
            />{" "}
            Pad incomplete bytes with zeros
          </label>
        )}
      </div>

      <div className="z85-tool__panels">
        <div className="z85-tool__panel">
          <label htmlFor="z85-input">{inputLabel}</label>
          <textarea
            id="z85-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              mode === "encode" && inputType === "bytes"
                ? "86 4F D2 6F"
                : "Enter data…"
            }
            spellCheck={false}
          />
        </div>
        <div className="z85-tool__panel">
          <div className="z85-tool__output-label">
            <label htmlFor="z85-output">{outputLabel}</label>
            <button
              type="button"
              className="z85-tool__button"
              onClick={copyOutput}
              disabled={!output}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <textarea
            id="z85-output"
            value={output}
            readOnly
            placeholder="Result will appear here…"
            spellCheck={false}
          />
        </div>
      </div>
      {copied && (
        <div className="sr-only" role="status" aria-live="polite">
          Copied to clipboard
        </div>
      )}
      {(error || copyError) && (
        <div className="z85-tool__error" role="alert">
          {error || copyError}
        </div>
      )}
    </section>
  );
}
