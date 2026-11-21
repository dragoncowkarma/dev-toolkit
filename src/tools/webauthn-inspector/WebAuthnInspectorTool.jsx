import { useState } from 'react';
import { parseWebAuthnInput } from './webauthnInspector.utils.js';
import './webauthnInspector.css';

function Result({ result }) {
  const { authData } = result;
  return <div className="webauthn-result" aria-label="WebAuthn inspection result">
    {result.fmt && <p><strong>Format:</strong> {result.fmt}</p>}
    {result.attStmt && <section>
      <h3>Attestation statement</h3>
      <p>Algorithm: {result.attStmt.algorithm ?? 'Not supplied'}</p>
      <p>Signature: {result.attStmt.signatureBytes ?? 0} bytes</p>
      <p>Certificates: {result.attStmt.certificateLengths.join(', ') || 'None'} bytes</p>
    </section>}
    <section>
      <h3>Authenticator data</h3>
      <p><strong>RP ID hash:</strong> <code>{authData.rpIdHash}</code></p>
      <p>Signature counter: {authData.signCount}</p>
      <div className="webauthn-flags">{authData.flags.map((flag) => <span
        key={flag.name} title={flag.description}
      >{flag.name}: {flag.set ? 'set' : 'clear'}</span>)}</div>
    </section>
    {authData.credential && <section>
      <h3>Attested credential data</h3>
      <p>AAGUID: <code>{authData.credential.aaguid}</code></p>
      <p>Credential ID: <code>{authData.credential.credentialId}</code></p>
      <p>COSE key: {authData.credential.coseKey.keyType};
        {' '}{authData.credential.coseKey.algorithm ?? 'algorithm not supplied'}</p>
    </section>}
    {authData.extensions && <section><h3>Extensions</h3>
      <pre>{JSON.stringify(authData.extensions, null, 2)}</pre>
    </section>}
  </div>;
}

/**
 * Renders a local WebAuthn attestationObject and authenticatorData inspector.
 *
 * @returns {React.JSX.Element} Inspector UI.
 */
export default function WebAuthnInspectorTool() {
  const [input, setInput] = useState('');
  const [type, setType] = useState('attestation');
  const [format, setFormat] = useState('base64url');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  function inspect() {
    try { setResult(parseWebAuthnInput(input, type, format)); setError(''); }
    catch (err) { setResult(null); setError(err.message); }
  }
  return <section className="webauthn-tool" aria-label="WebAuthn inspector">
    <label htmlFor="webauthn-input">WebAuthn data</label>
    <textarea id="webauthn-input" value={input}
      onChange={(event) => setInput(event.target.value)}
      placeholder="Paste Base64URL or Base64 WebAuthn data" spellCheck={false} />
    <div className="webauthn-controls"><label>Structure <select value={type}
      onChange={(event) => setType(event.target.value)}>
      <option value="attestation">attestationObject</option>
      <option value="authenticatorData">authenticatorData</option>
    </select></label><label>Input format <select value={format}
      onChange={(event) => setFormat(event.target.value)}>
      <option value="base64url">Base64URL</option><option value="base64">Base64</option>
    </select></label><button type="button" onClick={inspect}>Inspect WebAuthn data</button></div>
    {error && <div role="alert" className="webauthn-error">{error}</div>}
    {result && <Result result={result} />}
  </section>;
}
