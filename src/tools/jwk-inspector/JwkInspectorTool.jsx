import { useEffect, useRef, useState } from 'react';
import { parseAndValidateInput } from './jwkInspector.utils.js';
import './jwkInspector.css';

const SAMPLE_RSA_JWK = JSON.stringify(
  {
    kty: 'RSA',
    n:
      '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1' +
      'RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc' +
      '5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs' +
      '8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4v' +
      'MQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8aw' +
      'apJzKnqDKgw',
    e: 'AQAB',
    alg: 'RS256',
    kid: '2011-04-29',
  },
  null,
  2
);

const SAMPLE_JWKS = JSON.stringify(
  {
    keys: [
      {
        kty: 'EC',
        crv: 'P-256',
        x: 'XQMrqoqsYKHBsAFJTFF4ZWg4MgTg-y45Q-Ch-3Na1Uw',
        y: 'bNBNeL873WeTlLweyWapc8aKyEfatEaBAP57v83HfKE',
        use: 'sig',
        kid: 'ec-key-1',
      },
      {
        kty: 'RSA',
        n:
          'kPjSZnJU-ja6SKk7rk2sQ40pFxHasJiNJZPoST43ZcGdRH7U5lhPgY06FKnON52wm' +
          'z1BjI3xCgrLGnpbCgceQPMDnn9NKjhKdygDhc3LFzn7E937UD7AdYna8MRrGy1HV' +
          '2NkCcLUPelJ145Ue0FHYltYNoKWCMeZEvEhdnmnJGgs_pvCxHEisM7OlvTb-K5TX' +
          'krUW57Rf9kXqu1JkmOyZ_FuptcR4p-YvBGHK4nYUAq4chnwPwNhYD-ydNl-OMExT' +
          'kwEQGMsX-ZUTvf8_C6WJb0wQxYl-lXvqbLv9ycDhC_8Fnx6jAoA56LNPUSt_Vbhf' +
          'iVco9n49fB_4ZwN75Qcww',
        e: 'AQAB',
        use: 'sig',
        kid: 'rsa-key-2',
      },
    ],
  },
  null,
  2
);

const SAMPLE_PEM =
  '-----BEGIN PUBLIC KEY-----\n' +
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkPjSZnJU+ja6SKk7rk2s\n' +
  'Q40pFxHasJiNJZPoST43ZcGdRH7U5lhPgY06FKnON52wmz1BjI3xCgrLGnpbCgce\n' +
  'QPMDnn9NKjhKdygDhc3LFzn7E937UD7AdYna8MRrGy1HV2NkCcLUPelJ145Ue0FH\n' +
  'YltYNoKWCMeZEvEhdnmnJGgs/pvCxHEisM7OlvTb+K5TXkrUW57Rf9kXqu1JkmOy\n' +
  'Z/FuptcR4p+YvBGHK4nYUAq4chnwPwNhYD+ydNl+OMExTkwEQGMsX+ZUTvf8_C6W\n' +
  'Jb0wQxYl+lXvqbLv9ycDhC/8Fnx6jAoA56LNPUSt/VbhfiVco9n49fB/4ZwN75Qc\n' +
  'wwIDAQAB\n' +
  '-----END PUBLIC KEY-----';

/**
 * Renders the JWK Inspector tool interface.
 *
 * @returns {React.JSX.Element} JWK Inspector interface.
 */
export default function JwkInspectorTool() {
  const [input, setInput] = useState('');
  const [selectedMode, setSelectedMode] = useState('auto');
  const [sampleType, setSampleType] = useState('JWK');
  const [parseResult, setParseResult] = useState({
    mode: 'NONE',
    detectedMode: 'NONE',
    keys: [],
    error: null,
  });
  const [statusMessage, setStatusMessage] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const requestIdRef = useRef(0);

  useEffect(() => {
    const currentRequestId = (requestIdRef.current += 1);
    async function process() {
      const res = await parseAndValidateInput(input, selectedMode);
      if (requestIdRef.current === currentRequestId) {
        setParseResult(res);
      }
    }
    process();
  }, [input, selectedMode]);

  useEffect(() => {
    if (!copiedId) return undefined;
    const timer = setTimeout(() => setCopiedId(''), 1500);
    return () => clearTimeout(timer);
  }, [copiedId]);

  function handleLoadSample() {
    if (sampleType === 'JWK') {
      setInput(SAMPLE_RSA_JWK);
      setStatusMessage('Loaded sample RSA JWK.');
    } else if (sampleType === 'JWKS') {
      setInput(SAMPLE_JWKS);
      setStatusMessage('Loaded sample JWKS containing 2 keys.');
    } else if (sampleType === 'PEM') {
      setInput(SAMPLE_PEM);
      setStatusMessage('Loaded sample Public Key PEM.');
    }
  }

  function handleClear() {
    setInput('');
    setSelectedMode('auto');
    setStatusMessage('Cleared input and results.');
  }

  async function handleCopy(text, copyIdentifier, label) {
    if (!text) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable.');
      }
      await navigator.clipboard.writeText(text);
      setCopiedId(copyIdentifier);
      setStatusMessage(`Copied ${label} to clipboard.`);
    } catch {
      setStatusMessage('Failed to copy to clipboard.');
    }
  }

  return (
    <section className="jwk-inspector" aria-label="JWK Inspector Tool">
      {/* Live Region for Screen Readers */}
      <div className="sr-only" aria-live="polite" role="status">
        {statusMessage}
      </div>

      {/* Toolbar */}
      <div className="jwk-inspector__toolbar">
        <div className="jwk-inspector__header">
          <span className="jwk-inspector__eyebrow">JSON Web Key & PEM Toolkit</span>
          <p className="jwk-inspector__hint">
            Validate JWK/JWKS members, compute RFC 7638 thumbprints, and convert PEM↔JWK.
          </p>
        </div>

        <div className="jwk-inspector__actions">
          <div className="jwk-inspector__mode-group">
            <label className="jwk-inspector__mode-label" htmlFor="mode-select">
              Mode:
            </label>
            <select
              id="mode-select"
              className="jwk-inspector__select"
              value={selectedMode}
              onChange={(e) => setSelectedMode(e.target.value)}
            >
              <option value="auto">Auto-detect</option>
              <option value="JWK">JWK</option>
              <option value="JWKS">JWKS</option>
              <option value="PEM">PEM</option>
            </select>
          </div>

          <div className="jwk-inspector__mode-group">
            <select
              aria-label="Sample type selector"
              className="jwk-inspector__select"
              value={sampleType}
              onChange={(e) => setSampleType(e.target.value)}
            >
              <option value="JWK">Sample JWK</option>
              <option value="JWKS">Sample JWKS</option>
              <option value="PEM">Sample PEM</option>
            </select>

            <button
              type="button"
              className="jwk-inspector__button jwk-inspector__button--primary"
              onClick={handleLoadSample}
            >
              Load sample
            </button>

            <button
              type="button"
              className="jwk-inspector__button"
              onClick={handleClear}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Input Section */}
      <div className="jwk-inspector__field">
        <div className="jwk-inspector__label-row">
          <label className="jwk-inspector__label" htmlFor="jwk-input">
            JWK, JWKS, or Public Key PEM Input
          </label>
          {input.trim() && parseResult.detectedMode !== 'NONE' && (
            <span className="jwk-inspector__detected-badge">
              Detected: {parseResult.detectedMode}
            </span>
          )}
        </div>
        <textarea
          id="jwk-input"
          className="jwk-inspector__textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            'Paste JWK object ({"kty": "RSA"...}), JWKS ({"keys": [...]}), or SPKI PEM...'
          }
          spellCheck={false}
        />
      </div>

      {/* Global Error Banner */}
      {parseResult.error && (
        <div className="jwk-inspector__alert" role="alert">
          <strong>Error:</strong>
          <span>{parseResult.error}</span>
        </div>
      )}

      {/* Empty State */}
      {!input.trim() && !parseResult.error && (
        <div className="jwk-inspector__empty-state">
          Paste a JSON Web Key (JWK), a JWK Set (JWKS), or a Public Key PEM above to inspect.
        </div>
      )}

      {/* Results List */}
      {parseResult.keys.length > 0 && (
        <div className="jwk-inspector__results">
          {parseResult.keys.map((keyItem) => {
            const { index, jwk, validation, thumbprint, summary, pem, pemError } = keyItem;
            const thumbCopyId = `tp-${index}`;
            const jwkCopyId = `jwk-${index}`;
            const pemCopyId = `pem-${index}`;

            return (
              <div className="jwk-inspector__card" key={index}>
                <div className="jwk-inspector__card-header">
                  <h3 className="jwk-inspector__card-title">
                    Key #{index + 1}
                    {summary.kid !== 'None' && ` (${summary.kid})`}
                  </h3>
                  <div>
                    {validation.isValid ? (
                      <span className="jwk-inspector__badge jwk-inspector__badge--valid">
                        ✓ Valid {validation.kty}
                      </span>
                    ) : (
                      <span className="jwk-inspector__badge jwk-inspector__badge--invalid">
                        ✕ Invalid Key
                      </span>
                    )}
                  </div>
                </div>

                {/* Summary Metadata Grid */}
                <div className="jwk-inspector__summary-grid">
                  <div className="jwk-inspector__summary-item">
                    <span className="jwk-inspector__summary-label">Key Type (kty)</span>
                    <span className="jwk-inspector__summary-value">{summary.kty}</span>
                  </div>
                  <div className="jwk-inspector__summary-item">
                    <span className="jwk-inspector__summary-label">Details</span>
                    <span className="jwk-inspector__summary-value">{summary.details}</span>
                  </div>
                  <div className="jwk-inspector__summary-item">
                    <span className="jwk-inspector__summary-label">Algorithm (alg)</span>
                    <span className="jwk-inspector__summary-value">{summary.alg}</span>
                  </div>
                  <div className="jwk-inspector__summary-item">
                    <span className="jwk-inspector__summary-label">Usage (use)</span>
                    <span className="jwk-inspector__summary-value">{summary.use}</span>
                  </div>
                </div>

                {/* Validation Errors & Warnings */}
                {(validation.errors.length > 0 || validation.warnings.length > 0) && (
                  <div className="jwk-inspector__section">
                    <span className="jwk-inspector__section-title">Validation Status</span>
                    <ul className="jwk-inspector__messages">
                      {validation.errors.map((err, idx) => (
                        <li key={idx} className="jwk-inspector__error-text">
                          {err}
                        </li>
                      ))}
                      {validation.warnings.map((warn, idx) => (
                        <li key={idx} className="jwk-inspector__warning-text">
                          {warn}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* RFC 7638 Thumbprint */}
                {thumbprint && (
                  <div className="jwk-inspector__section">
                    <span className="jwk-inspector__section-title">
                      RFC 7638 Thumbprint (SHA-256 base64url)
                    </span>
                    <div className="jwk-inspector__code-wrapper">
                      <code className="jwk-inspector__code">{thumbprint}</code>
                      <button
                        type="button"
                        className="jwk-inspector__button"
                        onClick={() =>
                          handleCopy(thumbprint, thumbCopyId, `Key #${index + 1} thumbprint`)
                        }
                      >
                        {copiedId === thumbCopyId ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}

                {/* JWK Representation (when input was PEM) */}
                {parseResult.mode === 'PEM' && jwk && (
                  <div className="jwk-inspector__section">
                    <div className="jwk-inspector__label-row">
                      <span className="jwk-inspector__section-title">Converted JWK</span>
                      <button
                        type="button"
                        className="jwk-inspector__button"
                        onClick={() =>
                          handleCopy(
                            JSON.stringify(jwk, null, 2),
                            jwkCopyId,
                            `Key #${index + 1} JWK`
                          )
                        }
                      >
                        {copiedId === jwkCopyId ? 'Copied!' : 'Copy JWK'}
                      </button>
                    </div>
                    <pre className="jwk-inspector__pre">{JSON.stringify(jwk, null, 2)}</pre>
                  </div>
                )}

                {/* PEM Representation (when input was JWK/JWKS) */}
                {parseResult.mode !== 'PEM' && (
                  <div className="jwk-inspector__section">
                    <div className="jwk-inspector__label-row">
                      <span className="jwk-inspector__section-title">
                        PEM Public Key Representation
                      </span>
                      {pem && (
                        <button
                          type="button"
                          className="jwk-inspector__button"
                          onClick={() => handleCopy(pem, pemCopyId, `Key #${index + 1} PEM`)}
                        >
                          {copiedId === pemCopyId ? 'Copied!' : 'Copy PEM'}
                        </button>
                      )}
                    </div>
                    {pem ? (
                      <pre className="jwk-inspector__pre">{pem}</pre>
                    ) : (
                      <p className="jwk-inspector__hint">
                        {pemError || 'PEM conversion unavailable.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
