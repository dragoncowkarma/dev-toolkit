import { useEffect, useState } from 'react';
import { inspectCompactJwe } from './jweInspector.utils.js';
import './jweInspector.css';

/**
 * Renders a client-side structural inspector for JWE compact serializations.
 *
 * @returns {React.JSX.Element} The JWE inspector UI.
 */
export default function JweInspectorTool() {
  const [input, setInput] = useState('');
  const [inspection, setInspection] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!input.trim()) {
      setInspection(null);
      setError('');
      return;
    }

    try {
      setInspection(inspectCompactJwe(input));
      setError('');
    } catch (caughtError) {
      setInspection(null);
      setError(caughtError.message);
    }
  }, [input]);

  return (
    <section className="jwe-inspector" aria-label="JWE Inspector">
      <div className="jwe-inspector__intro">
        <p>Inspect JWE compact serialization locally. This tool does not decrypt the token.</p>
      </div>

      <label className="jwe-inspector__label" htmlFor="jwe-input">
        JWE compact token
      </label>
      <textarea
        id="jwe-input"
        className="jwe-inspector__input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="ProtectedHeader.EncryptedKey.IV.Ciphertext.AuthenticationTag"
        spellCheck={false}
      />

      {error && (
        <div className="jwe-inspector__error" role="alert">
          {error}
        </div>
      )}

      {inspection && (
        <div className="jwe-inspector__results">
          <section className="jwe-inspector__result" aria-labelledby="protected-header-heading">
            <h2 id="protected-header-heading">Protected Header</h2>
            <dl className="jwe-inspector__header-fields">
              {Object.entries(inspection.header).map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="jwe-inspector__result" aria-labelledby="segment-lengths-heading">
            <h2 id="segment-lengths-heading">Encrypted Segment Lengths</h2>
            <dl className="jwe-inspector__segment-lengths">
              {Object.entries(inspection.segmentLengths).map(([name, length]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{length} bytes</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </section>
  );
}
