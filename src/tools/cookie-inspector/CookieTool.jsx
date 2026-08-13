import { useMemo, useState } from 'react';
import {
  calculateExpiration,
  parseCookieInput,
  serializeDocumentCookie,
  serializeSetCookie,
  validateCookie,
} from './cookie.utils.js';
import './cookie.css';

const SAMPLE_INPUT = [
  'Set-Cookie: __Host-session=abc%20123; Path=/; Secure; HttpOnly; SameSite=Lax',
  'Set-Cookie: preferences=compact; Domain=.example.com; Path=/; Max-Age=3600',
].join('\n');

const MODES = [
  ['auto', 'Auto-detect'],
  ['set-cookie', 'Set-Cookie'],
  ['cookie', 'Request Cookie'],
];

function editableCookie(cookie) {
  const {
    expiration: _expiration,
    warnings: _warnings,
    unknownAttributes: _unknownAttributes,
    ...editable
  } = cookie;
  return editable;
}

function flagSummary(cookie) {
  const flags = [];
  if (cookie.secure) flags.push('Secure');
  if (cookie.httpOnly) flags.push('HttpOnly');
  if (cookie.partitioned) flags.push('Partitioned');
  return flags.join(', ') || '—';
}

/**
 * Renders the client-side Cookie Inspector parser, diagnostics, and attribute editor.
 *
 * @returns {React.JSX.Element} Cookie Inspector interface.
 */
export default function CookieTool() {
  const [rawInput, setRawInput] = useState('');
  const [mode, setMode] = useState('auto');
  const [decodeValues, setDecodeValues] = useState(false);
  const [result, setResult] = useState({ cookies: [], type: null, error: null });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editor, setEditor] = useState(null);
  const [copyStatus, setCopyStatus] = useState('');

  const outputs = useMemo(() => {
    if (!editor) return { header: '', snippet: '', error: '' };
    try {
      return {
        header: serializeSetCookie(editor),
        snippet: serializeDocumentCookie(editor),
        error: '',
      };
    } catch (error) {
      return { header: '', snippet: '', error: error.message };
    }
  }, [editor]);

  const editorWarnings = useMemo(
    () => (editor ? validateCookie(editor) : []),
    [editor],
  );
  const editorExpiration = useMemo(
    () => (editor ? calculateExpiration(editor) : null),
    [editor],
  );

  function inspect(nextDecodeValues = decodeValues) {
    const nextResult = parseCookieInput(rawInput, {
      mode,
      decodeValues: nextDecodeValues,
    });
    setResult(nextResult);
    setSelectedIndex(0);
    setEditor(nextResult.cookies[0] ? editableCookie(nextResult.cookies[0]) : null);
    setCopyStatus('');
  }

  function loadSample() {
    setRawInput(SAMPLE_INPUT);
    setMode('set-cookie');
    setDecodeValues(false);
    const nextResult = parseCookieInput(SAMPLE_INPUT, { mode: 'set-cookie' });
    setResult(nextResult);
    setSelectedIndex(0);
    setEditor(editableCookie(nextResult.cookies[0]));
    setCopyStatus('');
  }

  function clearAll() {
    setRawInput('');
    setResult({ cookies: [], type: null, error: null });
    setSelectedIndex(0);
    setEditor(null);
    setCopyStatus('');
  }

  function toggleDecoding(event) {
    const checked = event.target.checked;
    setDecodeValues(checked);
    if (rawInput.trim()) inspect(checked);
  }

  function selectCookie(index) {
    setSelectedIndex(index);
    setEditor(editableCookie(result.cookies[index]));
    setCopyStatus('');
  }

  function updateField(field, value) {
    setEditor((current) => ({ ...current, [field]: value }));
    setCopyStatus('');
  }

  async function copyOutput(value, label) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label} copied to clipboard.`);
    } catch {
      setCopyStatus(`Unable to copy the ${label.toLowerCase()} to the clipboard.`);
    }
  }

  const allWarnings = result.cookies.flatMap((cookie) => (
    cookie.warnings.map((warning) => ({ ...warning, cookieName: cookie.name }))
  ));

  return (
    <section className="cookie-inspector" aria-label="Cookie Inspector Tool">
      <header className="cookie-inspector__intro">
        <p className="cookie-inspector__eyebrow">Web</p>
        <h2>Cookie Inspector</h2>
        <p>
          Parse request and response cookies, check security flags, and build normalized
          Set-Cookie headers entirely in your browser.
        </p>
      </header>

      <div className="cookie-inspector__controls">
        <label htmlFor="cookie-mode">
          Input type
          <select
            id="cookie-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
            aria-label="Cookie input type"
          >
            {MODES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="cookie-inspector__check">
          <input
            type="checkbox"
            checked={decodeValues}
            onChange={toggleDecoding}
            aria-label="Decode URI-encoded cookie values"
          />
          Decode URI values
        </label>
      </div>

      <label className="cookie-inspector__input-label" htmlFor="cookie-raw-input">
        Raw cookie headers
      </label>
      <textarea
        id="cookie-raw-input"
        className="cookie-inspector__textarea"
        value={rawInput}
        onChange={(event) => setRawInput(event.target.value)}
        placeholder="Set-Cookie: session=abc; Path=/; Secure; HttpOnly; SameSite=Lax"
        spellCheck={false}
        aria-label="Raw cookie header input"
      />
      <div className="cookie-inspector__actions">
        <button type="button" className="cookie-inspector__primary" onClick={() => inspect()}>
          Inspect cookies
        </button>
        <button type="button" onClick={loadSample}>Load sample</button>
        <button type="button" onClick={clearAll}>Clear</button>
      </div>

      {result.error && (
        <p className="cookie-inspector__error" role="alert">{result.error.message}</p>
      )}

      {!result.error && result.cookies.length > 0 && (
        <>
          <p className="cookie-inspector__summary" role="status">
            Parsed {result.cookies.length} {result.cookies.length === 1 ? 'cookie' : 'cookies'}
            {' '}as {result.type === 'set-cookie' ? 'Set-Cookie' : 'request Cookie'} data.
          </p>

          <div className="cookie-inspector__table-wrap">
            <table aria-label="Parsed cookie attributes">
              <thead>
                <tr>
                  <th scope="col">Cookie Name</th>
                  <th scope="col">Value</th>
                  <th scope="col">Domain</th>
                  <th scope="col">Path</th>
                  <th scope="col">Expires (UTC / Local)</th>
                  <th scope="col">Max-Age / TTL</th>
                  <th scope="col">SameSite</th>
                  <th scope="col">Flags</th>
                </tr>
              </thead>
              <tbody>
                {result.cookies.map((cookie, index) => (
                  <tr key={`${cookie.name}-${cookie.line}-${index}`}>
                    <td>
                      <button
                        type="button"
                        className="cookie-inspector__select"
                        aria-pressed={selectedIndex === index}
                        aria-label={`Edit cookie ${cookie.name}`}
                        onClick={() => selectCookie(index)}
                      >
                        {cookie.name}
                      </button>
                    </td>
                    <td>{cookie.value || '—'}</td>
                    <td>{cookie.domain || '—'}</td>
                    <td>{cookie.path || '—'}</td>
                    <td>
                      {cookie.expiration.utc ? (
                        <span>
                          {cookie.expiration.utc}
                          <small>{cookie.expiration.local}</small>
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      {cookie.maxAge ?? '—'}
                      {cookie.expiration.ttlSeconds !== null && (
                        <small>{cookie.expiration.ttlSeconds} seconds remaining</small>
                      )}
                    </td>
                    <td>{cookie.sameSite || '—'}</td>
                    <td>{flagSummary(cookie)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {allWarnings.length > 0 && (
            <section className="cookie-inspector__warnings" aria-label="Cookie warnings">
              <h3>Security and scope diagnostics</h3>
              <ul>
                {allWarnings.map((warning, index) => (
                  <li
                    key={`${warning.cookieName}-${warning.code}-${index}`}
                    className={`cookie-inspector__warning--${warning.severity}`}
                    role="status"
                  >
                    <span>{warning.severity === 'high' ? 'Security' : 'Review'}</span>
                    <strong>{warning.cookieName}:</strong> {warning.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {editor && (
            <section className="cookie-inspector__editor" aria-labelledby="cookie-editor-title">
              <div className="cookie-inspector__section-heading">
                <div>
                  <p className="cookie-inspector__eyebrow">Selected cookie</p>
                  <h3 id="cookie-editor-title">Attribute editor</h3>
                </div>
                <span>{result.cookies[selectedIndex].name}</span>
              </div>

              <div className="cookie-inspector__fields">
                <label>
                  Name
                  <input
                    value={editor.name}
                    onChange={(event) => updateField('name', event.target.value)}
                    aria-label="Cookie name"
                  />
                </label>
                <label>
                  Value
                  <input
                    value={editor.value}
                    onChange={(event) => updateField('value', event.target.value)}
                    aria-label="Cookie value"
                  />
                </label>
                <label>
                  Domain
                  <input
                    value={editor.domain}
                    onChange={(event) => updateField('domain', event.target.value)}
                    placeholder=".example.com"
                    aria-label="Cookie domain"
                  />
                </label>
                <label>
                  Path
                  <input
                    value={editor.path}
                    onChange={(event) => updateField('path', event.target.value)}
                    placeholder="/"
                    aria-label="Cookie path"
                  />
                </label>
                <label>
                  Max-Age (seconds)
                  <input
                    type="number"
                    step="1"
                    value={editor.maxAge ?? ''}
                    onChange={(event) => updateField(
                      'maxAge',
                      event.target.value === '' ? null : Number(event.target.value),
                    )}
                    aria-label="Cookie Max-Age"
                  />
                </label>
                <label>
                  Expires
                  <input
                    value={editor.expires}
                    onChange={(event) => updateField('expires', event.target.value)}
                    placeholder="Wed, 21 Oct 2026 07:28:00 GMT"
                    aria-label="Cookie Expires"
                  />
                </label>
                <label>
                  SameSite
                  <select
                    value={editor.sameSite}
                    onChange={(event) => updateField('sameSite', event.target.value)}
                    aria-label="Cookie SameSite"
                  >
                    <option value="">Not set</option>
                    <option value="Strict">Strict</option>
                    <option value="Lax">Lax</option>
                    <option value="None">None</option>
                  </select>
                </label>
              </div>

              <fieldset className="cookie-inspector__flags">
                <legend>Security flags</legend>
                {[
                  ['secure', 'Secure'],
                  ['httpOnly', 'HttpOnly'],
                  ['partitioned', 'Partitioned'],
                ].map(([field, label]) => (
                  <label key={field}>
                    <input
                      type="checkbox"
                      checked={editor[field]}
                      onChange={(event) => updateField(field, event.target.checked)}
                      aria-label={`Cookie ${label}`}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>

              {editorExpiration?.expiresAt && (
                <dl className="cookie-inspector__expiration">
                  <div><dt>Effective UTC</dt><dd>{editorExpiration.utc}</dd></div>
                  <div><dt>Local time</dt><dd>{editorExpiration.local}</dd></div>
                  <div><dt>TTL</dt><dd>{editorExpiration.ttlSeconds} seconds</dd></div>
                </dl>
              )}

              {editorWarnings.length > 0 && (
                <ul className="cookie-inspector__editor-warnings">
                  {editorWarnings.map((warning, index) => (
                    <li key={`${warning.code}-${index}`} role="status">{warning.message}</li>
                  ))}
                </ul>
              )}

              {outputs.error && (
                <p className="cookie-inspector__error" role="alert">{outputs.error}</p>
              )}

              <div className="cookie-inspector__outputs">
                <OutputBlock
                  id="set-cookie-output"
                  label="Set-Cookie header"
                  value={outputs.header}
                  onCopy={() => copyOutput(outputs.header, 'Set-Cookie header')}
                />
                <OutputBlock
                  id="document-cookie-output"
                  label="document.cookie snippet"
                  value={outputs.snippet}
                  onCopy={() => copyOutput(outputs.snippet, 'document.cookie snippet')}
                />
              </div>
            </section>
          )}
        </>
      )}

      <p className="cookie-inspector__copy-status" aria-live="polite">
        {copyStatus}
      </p>
    </section>
  );
}

function OutputBlock({ id, label, value, onCopy }) {
  return (
    <div className="cookie-inspector__output">
      <div>
        <label htmlFor={id}>{label}</label>
        <button type="button" onClick={onCopy} disabled={!value} aria-label={`Copy ${label}`}>
          Copy
        </button>
      </div>
      <textarea id={id} value={value} readOnly spellCheck={false} aria-label={label} />
    </div>
  );
}
