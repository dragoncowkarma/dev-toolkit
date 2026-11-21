import { useRef, useState } from 'react';
import { parseRpmHeader } from './rpm-header.utils.js';
import './rpm-header-inspector.css';

/**
 * Renders a client-side RPM lead and header metadata inspector.
 *
 * @returns {React.JSX.Element} The RPM header inspector UI.
 */
export default function RpmHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setResult(parseRpmHeader(await file.arrayBuffer()));
      setError('');
    } catch (parseError) {
      setResult(null);
      setError(parseError.message || 'Unable to inspect this RPM file.');
    }
  }

  function handleClear() {
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="rpm-header-inspector" aria-label="RPM Package Header Inspector">
      <div className="rpm-header-inspector__controls">
        <label className="rpm-header-inspector__button">
          Choose RPM file
          <input
            ref={fileInputRef}
            type="file"
            accept=".rpm,application/x-rpm"
            onChange={handleFileChange}
            aria-label="Choose an RPM package file"
          />
        </label>
        <button type="button" className="rpm-header-inspector__button" onClick={handleClear}>
          Clear
        </button>
      </div>

      <p className="rpm-header-inspector__hint">
        Reads the RPM lead, signature, and main header locally. Payload contents are not extracted.
      </p>

      {error && <div className="rpm-header-inspector__error" role="alert">{error}</div>}

      {result && (
        <div className="rpm-header-inspector__results">
          <section>
            <h2>Package metadata</h2>
            <dl className="rpm-header-inspector__metadata">
              {Object.entries(result.metadata).map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          </section>
          <section>
            <h2>RPM lead</h2>
            <dl className="rpm-header-inspector__metadata">
              <div><dt>Version</dt><dd>{result.lead.major}.{result.lead.minor}</dd></div>
              <div><dt>Package type</dt><dd>{result.lead.packageType}</dd></div>
              <div><dt>Architecture number</dt><dd>{result.lead.architecture}</dd></div>
              <div><dt>Package name</dt><dd>{result.lead.name}</dd></div>
              <div><dt>Operating system</dt><dd>{result.lead.operatingSystem}</dd></div>
              <div><dt>Signature type</dt><dd>{result.lead.signatureType}</dd></div>
            </dl>
          </section>
          <section>
            <h2>Header entries</h2>
            <p>
              Signature: {result.signature.entryCount} entries; main:{' '}
              {result.header.entryCount} entries.
            </p>
            <ul className="rpm-header-inspector__tags">
              {result.header.tags.map((tag, index) => (
                <li key={`${tag.tag}-${index}`}>
                  <strong>{tag.label}</strong> ({tag.typeName}, {tag.count})
                  {tag.value !== null ? `: ${tag.value}` : ''}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </section>
  );
}
