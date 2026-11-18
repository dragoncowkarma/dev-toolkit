import { useRef, useState } from "react";
import { parseGzipMembers } from "./gzip-header.utils.js";
import "./gzip-header-inspector.css";

function Member({ member }) {
  const fields = [
    ["Compression method", member.compressionMethod],
    [
      "Flags",
      Object.entries(member.flags)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name.toUpperCase())
        .join(", ") || "None",
    ],
    ["Modified time", member.modifiedTime],
    ["Extra flags", member.extraFlags],
    ["Operating system", member.operatingSystem],
    ...(member.originalFilename !== undefined
      ? [["Original filename", member.originalFilename]]
      : []),
    ...(member.comment !== undefined ? [["Comment", member.comment]] : []),
    ...(member.headerCrc16 ? [["Header CRC16", member.headerCrc16]] : []),
    ["CRC32", member.crc32],
    ["Uncompressed size (mod 2³²)", String(member.inputSize)],
  ];
  return (
    <article className="gzip-member">
      <h3>Member {member.index}</h3>
      <dl>
        {fields.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {member.extraFields && (
        <>
          <h4>Extra subfields</h4>
          <dl>
            {member.extraFields.map((field, index) => (
              <div key={`${field.id}-${index}`}>
                <dt>
                  {field.id} ({field.length} bytes)
                </dt>
                <dd>{field.data || "Empty"}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </article>
  );
}

/** Uploads a GZIP file and displays RFC 1952 member metadata without decompression. */
export default function GzipHeaderInspectorTool() {
  const inputRef = useRef(null);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(
    "Choose or drop a GZIP file to inspect its headers.",
  );
  async function inspect(file) {
    if (!file) return;
    try {
      const parsed = parseGzipMembers(new Uint8Array(await file.arrayBuffer()));
      setMembers(parsed);
      setError("");
      setStatus(
        `${file.name}: found ${parsed.length} GZIP ${parsed.length === 1 ? "member" : "members"}.`,
      );
    } catch (caught) {
      setMembers([]);
      setError(caught.message);
      setStatus(`Could not inspect ${file.name}.`);
    }
  }
  function onKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  }
  return (
    <section className="gzip-inspector" aria-label="GZIP Header Inspector">
      <input
        ref={inputRef}
        className="gzip-file-input"
        type="file"
        accept=".gz,application/gzip"
        onChange={(event) => inspect(event.target.files?.[0])}
        aria-label="Choose a GZIP file"
      />
      <div
        className="gzip-drop-zone"
        role="button"
        tabIndex="0"
        onKeyDown={onKeyDown}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          inspect(event.dataTransfer.files?.[0]);
        }}
      >
        Drop a GZIP file here, or press Enter to choose one.
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      {error && (
        <div className="gzip-error" role="alert">
          ⚠ {error}
        </div>
      )}
      {members.map((member) => (
        <Member key={member.index} member={member} />
      ))}
    </section>
  );
}
