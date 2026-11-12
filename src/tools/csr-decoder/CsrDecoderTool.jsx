import { useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import { parseCsr, SAMPLE_ECDSA_CSR, SAMPLE_RSA_CSR } from './csrDecoder.utils.js';
import './csrDecoder.css';

function CopyButton({ value, label }) {
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });
  async function copy() {
    try { await navigator.clipboard.writeText(value); showCopied(true); } catch {
      // Copy availability varies by browser and is not required to inspect a CSR.
    }
  }
  return (
    <button type="button" className="csr-copy" onClick={copy}>
      {copied ? 'Copied' : `Copy ${label}`}
    </button>
  );
}

/** Renders a client-side PKCS#10 certificate signing request inspector. */
export default function CsrDecoderTool() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  function decode(value = input) {
    try { setResult(parseCsr(value)); setError(''); } catch (caught) {
      setResult(null); setError(caught.message);
    }
  }
  function loadSample(sample) { setInput(sample); decode(sample); }
  function clear() { setInput(''); setResult(null); setError(''); }
  const sanList = result?.extensions.find(
    (item) => item.name === 'Subject Alternative Name'
  )?.value;
  return (
    <section className="csr-tool" aria-label="CSR Decoder Tool">
      <p className="csr-tool__intro">
        Inspect PKCS#10 requests locally. Your PEM never leaves this browser.
      </p>
      <div className="csr-toolbar">
        <button type="button" onClick={() => loadSample(SAMPLE_RSA_CSR)}>
          Load RSA + SAN sample
        </button>
        <button type="button" onClick={() => loadSample(SAMPLE_ECDSA_CSR)}>
          Load ECDSA sample
        </button>
        <button type="button" onClick={clear}>Clear</button>
      </div>
      <label htmlFor="csr-input">PEM certificate signing request</label>
      <textarea
        id="csr-input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="-----BEGIN CERTIFICATE REQUEST-----"
        spellCheck={false}
      />
      <button type="button" className="csr-decode" onClick={() => decode()}>
        Decode CSR
      </button>
      {error && <div className="csr-error" role="alert">{error}</div>}
      {result && (
        <div className="csr-results">
          <article>
            <h3>Subject</h3>
            <p>{result.subjectDn || 'Empty subject'}</p>
            <CopyButton value={result.subjectDn} label="subject" />
            <dl>
              {result.subject.map((field) => (
                <div key={`${field.name}-${field.value}`}>
                  <dt>{field.name}</dt><dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          </article>
          <article>
            <h3>Public Key</h3><p>{result.publicKey.algorithm}</p>
            <p>{result.publicKey.details}</p><p>CSR version: {result.version}</p>
            <p>Signature: {result.signatureAlgorithm}</p>
          </article>
          <article>
            <h3>Requested Extensions / Attributes</h3>
            {result.extensions.length ? (
              <ul>
                {result.extensions.map((extension) => (
                  <li key={extension.name}>{extension.name}: {extension.value}</li>
                ))}
              </ul>
            ) : <p>No requested extensions.</p>}
            {sanList && <CopyButton value={sanList} label="SAN list" />}
            <p>Attributes: {result.attributes.join(', ') || 'None'}</p>
          </article>
          <article>
            <h3>Raw ASN.1 / PEM details</h3>
            <p>{result.derBytes} DER bytes{result.rawDerTruncated ? ' (first 128 shown)' : ''}</p>
            <code>{result.rawDer}</code>
          </article>
        </div>
      )}
    </section>
  );
}
