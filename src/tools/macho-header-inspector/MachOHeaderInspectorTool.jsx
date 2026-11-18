import { useRef, useState } from "react";
import {
  formatHex,
  inspectMachO,
  MachOParseError,
} from "./macho-header-inspector.utils.js";
import "./macho-header-inspector.css";

function CommandDetails({ command }) {
  if (command.segment) {
    const segment = command.segment;
    return (
      <div className="macho-inspector__details">
        Segment <strong>{segment.name}</strong>: vm{" "}
        {formatHex(segment.vmAddress)} / {formatHex(segment.vmSize)}, file{" "}
        {formatHex(segment.fileOffset)} / {formatHex(segment.fileSize)}
        {segment.sections.length > 0 && (
          <ul>
            {segment.sections.map((section) => (
              <li key={`${segment.name}-${section.name}`}>
                {section.name}: {formatHex(section.address)} /{" "}
                {formatHex(section.size)}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  if (command.dylib) {
    const dylib = command.dylib;
    return (
      <div className="macho-inspector__details">
        {dylib.path} (current {dylib.currentVersion}, compatible{" "}
        {dylib.compatibilityVersion}, timestamp {dylib.timestamp})
      </div>
    );
  }
  return null;
}

function Architecture({ header, index }) {
  return (
    <article className="macho-inspector__architecture">
      <h3>{header.fatCpu ?? `Architecture ${index + 1}`}</h3>
      <dl className="macho-inspector__facts">
        <div>
          <dt>Magic</dt>
          <dd>{header.magic}</dd>
        </div>
        <div>
          <dt>CPU</dt>
          <dd>{header.cpu}</dd>
        </div>
        <div>
          <dt>Format</dt>
          <dd>
            {header.is64Bit ? "64-bit" : "32-bit"} {header.endianness}
          </dd>
        </div>
        <div>
          <dt>File type</dt>
          <dd>{header.fileType}</dd>
        </div>
        <div>
          <dt>Load commands</dt>
          <dd>{header.commandCount}</dd>
        </div>
        <div>
          <dt>Command bytes</dt>
          <dd>{header.commandsSize}</dd>
        </div>
        <div>
          <dt>Flags</dt>
          <dd>{header.flags.join(", ") || "None"}</dd>
        </div>
      </dl>
      <h4>Load commands</h4>
      {header.commands.length === 0 ? (
        <p>No load commands.</p>
      ) : (
        <ol className="macho-inspector__commands">
          {header.commands.map((command, commandIndex) => (
            <li key={`${commandIndex}-${command.type}`}>
              <strong>{command.type}</strong>{" "}
              <span>({command.size} bytes)</span>
              <CommandDetails command={command} />
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

/** Renders a client-side Mach-O binary header and load-command inspector. */
export default function MachOHeaderInspectorTool() {
  const inputRef = useRef(null);
  const [inspection, setInspection] = useState(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  async function inspectFile(file) {
    if (!file) return;
    try {
      setInspection(inspectMachO(await file.arrayBuffer()));
      setFileName(file.name);
      setError("");
    } catch (caughtError) {
      setInspection(null);
      setFileName(file.name);
      setError(
        caughtError instanceof MachOParseError
          ? caughtError.message
          : "Could not read this file.",
      );
    }
  }
  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    inspectFile(event.dataTransfer.files?.[0]);
  }
  function handleChange(event) {
    inspectFile(event.target.files?.[0]);
  }

  return (
    <section className="macho-inspector" aria-label="Mach-O Header Inspector">
      <input
        ref={inputRef}
        className="macho-inspector__input"
        type="file"
        onChange={handleChange}
        aria-label="Choose Mach-O binary"
      />
      <div
        className={`macho-inspector__drop-zone ${
          isDragging ? 'macho-inspector__drop-zone--active' : ''
        }`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <h2>Mach-O Header Inspector</h2>
        <p>
          Drop a macOS or iOS executable, object file, dylib, or universal
          binary here.
        </p>
        <button type="button" onClick={() => inputRef.current?.click()}>
          Choose binary
        </button>
      </div>
      {fileName && <p className="macho-inspector__file">File: {fileName}</p>}
      {error && (
        <p className="macho-inspector__error" role="alert">
          {error}
        </p>
      )}
      {inspection && (
        <div className="macho-inspector__results">
          <p>
            {inspection.isUniversal
              ? `Universal binary with ${inspection.architectures.length} architectures.`
              : "Thin Mach-O binary."}
          </p>
          {inspection.architectures.map((header, index) => (
            <Architecture
              key={`${index}-${header.cpu}`}
              header={header}
              index={index}
            />
          ))}
        </div>
      )}
    </section>
  );
}
