import { useRef, useState } from "react";
import { inspectClassFile } from "./classFile.utils.js";
import "./classFile.css";

function List({ items, empty = "None" }) {
  return items.length ? (
    <ul>
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  ) : (
    <span>{empty}</span>
  );
}

/** Renders a local-only JVM class-file inspector. */
export default function ClassFileInspector() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const inputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setResult(await inspectClassFile(file));
      setFileName(file.name);
      setError("");
    } catch (caughtError) {
      setResult(null);
      setFileName(file.name);
      setError(caughtError.message);
    }
  }

  function handleClear() {
    setResult(null);
    setError("");
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section
      className="class-file-inspector"
      aria-label="Java Class File Inspector"
    >
      <div className="class-file-inspector__toolbar">
        <label className="class-file-inspector__upload">
          Choose .class file
          <input
            ref={inputRef}
            type="file"
            accept=".class,application/java-vm"
            onChange={handleFileChange}
          />
        </label>
        <button type="button" onClick={handleClear}>
          Clear
        </button>
        <span className="class-file-inspector__privacy">
          Files are parsed locally and never uploaded.
        </span>
      </div>
      {fileName && <p className="class-file-inspector__filename">{fileName}</p>}
      {error && (
        <div className="class-file-inspector__error" role="alert">
          ⚠ {error}
        </div>
      )}
      {result && (
        <div className="class-file-inspector__results">
          <section>
            <h2>Header</h2>
            <dl>
              <dt>Magic</dt>
              <dd>{result.magic}</dd>
              <dt>Version</dt>
              <dd>
                {result.majorVersion}.{result.minorVersion} ({result.jdkRelease}
                )
              </dd>
              <dt>Access flags</dt>
              <dd>{result.flags.join(", ") || "None"}</dd>
              <dt>This class</dt>
              <dd>{result.thisClass}</dd>
              <dt>Super class</dt>
              <dd>{result.superClass ?? "None"}</dd>
              <dt>Interfaces</dt>
              <dd>
                <List items={result.interfaces} />
              </dd>
            </dl>
          </section>
          <section>
            <h2>Members</h2>
            <p>
              {result.fields.length} fields · {result.methods.length} methods
            </p>
            <h3>Fields</h3>
            <List
              items={result.fields.map((member) =>
                `${member.flags.join(" ")} ${member.name} ${member.descriptor}`.trim(),
              )}
            />
            <h3>Methods</h3>
            <List
              items={result.methods.map((member) =>
                `${member.flags.join(" ")} ${member.name} ${member.descriptor}`.trim(),
              )}
            />
          </section>
          <section>
            <h2>Top-level attributes</h2>
            <List items={result.attributes} />
          </section>
          <section>
            <h2>Constant pool ({result.constantPoolCount - 1} entries)</h2>
            <div className="class-file-inspector__pool">
              {result.constantPool.map((entry) => (
                <div key={entry.index}>
                  <strong>
                    #{entry.index} {entry.type}
                  </strong>
                  <span>{entry.value}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
