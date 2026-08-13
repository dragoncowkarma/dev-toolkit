import { useMemo, useState } from 'react';
import {
  decodeEncodedWords,
  parseAuthResults,
  parseEmailHeaders,
  parseReceivedChain,
} from './emailHeader.utils.js';
import './emailHeader.css';

function formatDelay(seconds) {
  if (seconds === null) return 'Unknown';
  const direction = seconds < 0 ? '-' : '';
  const absolute = Math.abs(seconds);
  const minutes = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return minutes > 0 ? `${direction}${minutes}m ${remainder}s` : `${direction}${remainder}s`;
}

/**
 * Renders an offline RFC 5322 email-header report for pasted text only.
 * @returns {React.JSX.Element} Email Header Analyzer interface.
 */
export default function EmailHeaderTool() {
  const [rawInput, setRawInput] = useState('');
  const [submittedInput, setSubmittedInput] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const parseResult = useMemo(
    () => (submittedInput === null ? null : parseEmailHeaders(submittedInput)),
    [submittedInput],
  );
  const received = useMemo(
    () => (parseResult?.error ? null : parseReceivedChain(parseResult?.fields)),
    [parseResult],
  );
  const auth = useMemo(
    () => (parseResult?.error ? null : parseAuthResults(parseResult?.fields)),
    [parseResult],
  );

  function analyze() {
    setSubmittedInput(rawInput);
  }

  const hasReport = parseResult && !parseResult.error;
  return (
    <section className="email-header" aria-label="Email Header Analyzer Tool">
      <header className="email-header__intro">
        <p className="email-header__eyebrow">Offline inspector</p>
        <h2>Email Header Analyzer</h2>
        <p>
          Understand delivery routing and mail authentication without sending your header anywhere.
        </p>
      </header>

      <label className="email-header__label" htmlFor="email-header-input">Raw email headers</label>
      <textarea
        id="email-header-input"
        className="email-header__input"
        value={rawInput}
        onChange={(event) => setRawInput(event.target.value)}
        placeholder="Paste RFC 5322 headers, including Received and Authentication-Results…"
        spellCheck={false}
      />
      <button className="email-header__analyze" type="button" onClick={analyze}>Analyze</button>

      {parseResult?.error && (
        <p className="email-header__error" role="alert">{parseResult.error.message}</p>
      )}

      {hasReport && (
        <div className="email-header__report">
          <label className="email-header__toggle">
            <input
              type="checkbox"
              checked={showRaw}
              onChange={(event) => setShowRaw(event.target.checked)}
            />
            Show raw header values
          </label>

          <section aria-labelledby="email-header-fields-title">
            <h3 id="email-header-fields-title">Header fields</h3>
            <div className="email-header__table-wrap">
              <table className="email-header__table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Value</th>
                    <th scope="col">Line</th>
                    <th scope="col">Duplicate</th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.fields.map((field) => (
                    <tr key={`${field.line}-${field.name}`}>
                      <td>{field.name}</td>
                      <td className="email-header__value">
                        {showRaw ? field.value : decodeEncodedWords(field.value)}
                      </td>
                      <td>{field.line}</td>
                      <td>{field.isDuplicate ? 'Yes' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="email-header-hops-title">
            <h3 id="email-header-hops-title">Delivery hops</h3>
            {received.hops.length > 0 ? (
              <ol className="email-header__hops">
                {received.hops.map((hop, index) => (
                  <li key={`${hop.line}-${index}`}>
                    <strong>
                      {hop.from ?? 'Unknown sender'} → {hop.by ?? 'Unknown recipient relay'}
                    </strong>
                    <span>
                      {hop.with ?? 'Protocol unknown'} · {hop.date ?? 'Date unavailable'}
                    </span>
                    <span>
                      Delay: {formatDelay(hop.delaySeconds)}
                      {hop.clockSkew ? ' (clock skew)' : ''}
                    </span>
                  </li>
                ))}
              </ol>
            ) : <p className="email-header__empty">No Received fields were found.</p>}
            {received.hops.length > 0 && (
              <p className="email-header__total">
                Known total delay: {formatDelay(received.totalSeconds)}
              </p>
            )}
          </section>

          <section aria-labelledby="email-header-auth-title">
            <h3 id="email-header-auth-title">Authentication results</h3>
            <dl className="email-header__auth">
              {Object.entries(auth).map(([method, verdict]) => (
                <div key={method}>
                  <dt>{method.toUpperCase()}</dt>
                  <dd><strong>{verdict.result}</strong><span>{verdict.detail}</span></dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </section>
  );
}
