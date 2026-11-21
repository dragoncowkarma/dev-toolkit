import { useRef, useState } from 'react';
import { decodeClassInput, parseJavaClassFile } from './javaClassFile.utils.js';
import './javaClassFileInspector.css';

/** Renders a passive, client-side JVM class-file metadata inspector. */
export default function JavaClassFileInspectorTool() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  function inspect(bytes) {
    try {
      setResult(parseJavaClassFile(bytes));
      setError('');
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  function handleTextChange(event) {
    const value = event.target.value;
    setInput(value);
    if (!value.trim()) {
      setResult(null);
      setError('');
      return;
    }
    try {
      inspect(decodeClassInput(value));
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setInput(`Loaded ${file.name} (${file.size} bytes)`);
    try {
      inspect(new Uint8Array(await file.arrayBuffer()));
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  function clear() {
    setInput('');
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="java-class-file-inspector" aria-label="Java Class File Inspector">
      <div className="java-class-file-inspector__actions">
        <label className="java-class-file-inspector__upload">
          Upload .class file
          <input
            ref={fileInputRef}
            type="file"
            accept=".class,application/java-vm"
            aria-label="Upload a Java class file"
            onChange={handleFileChange}
          />
        </label>
        <button type="button" onClick={clear}>Clear</button>
      </div>
      <label htmlFor="java-class-input">Hexadecimal or Base64 class-file data</label>
      <textarea
        id="java-class-input"
        value={input}
        onChange={handleTextChange}
        spellCheck={false}
        placeholder="CAFEBABE0000003D... or Base64 data"
      />
      {error && (
        <div className="java-class-file-inspector__error" role="alert">{error}</div>
      )}
      {result && (
        <div className="java-class-file-inspector__result">
          <dl className="java-class-file-inspector__summary">
            <div><dt>Magic</dt><dd>{result.magic}</dd></div>
            <div>
              <dt>Version</dt>
              <dd>{result.majorVersion}.{result.minorVersion} ({result.javaVersion})</dd>
            </div>
            <div><dt>Access flags</dt><dd>{result.accessFlags.join(', ') || 'none'}</dd></div>
            <div><dt>This class</dt><dd>{result.thisClass}</dd></div>
            <div><dt>Super class</dt><dd>{result.superClass}</dd></div>
            <div><dt>Interfaces</dt><dd>{result.interfacesCount}</dd></div>
            <div>
              <dt>Fields / methods / attributes</dt>
              <dd>{result.fieldsCount} / {result.methodsCount} / {result.attributesCount}</dd>
            </div>
          </dl>
          <h3>Top-level attributes</h3>
          <ul>
            {result.attributes.map((attribute) => (
              <li key={`${attribute.name}-${attribute.length}`}>
                {attribute.name} ({attribute.length} bytes)
              </li>
            ))}
          </ul>
          <details open>
            <summary>Constant pool ({result.constantPoolCount - 1} entries)</summary>
            <ol>
              {result.constantPool.map((entry) => (
                <li key={entry.index}>
                  <strong>#{entry.index} {entry.tagName}</strong>: {entry.resolvedValue}
                </li>
              ))}
            </ol>
          </details>
        </div>
      )}
    </section>
  );
}
