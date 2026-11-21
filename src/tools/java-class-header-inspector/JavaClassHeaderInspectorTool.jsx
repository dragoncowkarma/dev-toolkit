import { useRef, useState } from 'react';
import { createSampleClassFile, parseJavaClassHeader } from './javaClassParser.js';
import './javaClassHeaderInspector.css';

function HeaderDetails({ header }) {
  const rows = [
    ['Magic number', header.magicNumber],
    ['Minor version', header.minorVersion],
    ['Major version', `${header.majorVersion} (${header.javaVersion})`],
    ['Constant pool count', header.constantPoolCount],
    ['Access flags', header.accessFlags.join(', ') || 'None'],
    ['this_class', header.thisClass],
    ['Class name', header.className],
    ['super_class', header.superClass],
    ['Superclass name', header.superClassName],
    ['Interfaces count', header.interfacesCount],
  ];
  return (
    <dl className="java-class-header-inspector__details">
      {rows.map(([label, value]) => (
        <div key={label} className="java-class-header-inspector__row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Renders a client-side Java .class file header inspector.
 *
 * @returns {React.JSX.Element} The Java class header inspector UI.
 */
export default function JavaClassHeaderInspectorTool() {
  const [header, setHeader] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  function inspect(buffer, name) {
    try {
      setHeader(parseJavaClassHeader(buffer));
      setFileName(name);
      setError('');
    } catch (err) {
      setHeader(null);
      setFileName('');
      setError(err.message);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      inspect(await file.arrayBuffer(), file.name);
    } catch {
      setHeader(null);
      setFileName('');
      setError('Unable to read the selected class file.');
    }
  }

  function handleSample() {
    inspect(createSampleClassFile(), 'SampleClass.class');
  }

  function handleClear() {
    setHeader(null);
    setError('');
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="java-class-header-inspector" aria-label="Java class header inspector">
      <div className="java-class-header-inspector__actions">
        <label className="java-class-header-inspector__button">
          Choose .class file
          <input
            ref={inputRef}
            type="file"
            accept=".class,application/java-vm"
            onChange={handleFileChange}
            aria-label="Choose a Java class file"
          />
        </label>
        <button type="button" onClick={handleSample}>Load sample</button>
        <button type="button" onClick={handleClear}>Clear</button>
      </div>
      <p className="java-class-header-inspector__hint">
        Files are parsed locally in your browser and are never uploaded.
      </p>
      {error && (
        <div className="java-class-header-inspector__error" role="alert">
          {error}
        </div>
      )}
      {header && (
        <div className="java-class-header-inspector__result">
          <h2>{fileName}</h2>
          <HeaderDetails header={header} />
        </div>
      )}
    </section>
  );
}
