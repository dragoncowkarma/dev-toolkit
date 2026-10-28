import { useMemo, useState } from 'react';
import { parseSyslogBatch } from './syslogParser.utils.js';
import './syslog-parser.css';

const SAMPLES = [
  '<34>1 2026-10-29T12:30:45.123Z web-01 nginx 1234 access ' +
    '[meta@32473 user="sam" action="login"] Request accepted',
  '<13>Oct 29 12:31:00 router-1 sshd[445]: Failed password for root',
  'not a valid syslog message',
].join('\n');

function displayValue(value) {
  return value ?? '—';
}

/**
 * Renders a client-side inspector for RFC 5424 and RFC 3164 syslog messages.
 * @returns {React.JSX.Element} The syslog parser interface.
 */
export default function SyslogParserTool() {
  const [input, setInput] = useState('');
  const results = useMemo(() => (input ? parseSyslogBatch(input) : []), [input]);

  return (
    <section className="syslog-parser-tool" aria-label="Syslog Message Parser">
      <div className="syslog-parser-tool__toolbar">
        <div>
          <h2>Syslog Message Parser</h2>
          <p>Inspect RFC 5424 and RFC 3164 messages entirely in your browser.</p>
        </div>
        <div className="syslog-parser-tool__actions">
          <button type="button" onClick={() => setInput(SAMPLES)}>Load samples</button>
          <button type="button" onClick={() => setInput('')} disabled={!input}>Clear</button>
        </div>
      </div>
      <label htmlFor="syslog-input">Syslog messages</label>
      <textarea
        id="syslog-input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Paste one syslog message per line…"
        spellCheck={false}
      />

      {results.length > 0 && (
        <div className="syslog-parser-tool__results" aria-live="polite">
          {results.map((result) => (
            <article className="syslog-result" key={result.lineNumber}>
              <header>
                <strong>Line {result.lineNumber}</strong>
                <span
                  className={
                    `syslog-result__validity ${result.isValid ? 'is-valid' : 'is-invalid'}`
                  }
                >
                  {result.isValid ? 'Valid' : 'Invalid'} {result.format}
                </span>
              </header>
              {(result.errors.length > 0 || result.warnings.length > 0) && (
                <div className="syslog-result__notices">
                  {result.errors.map((error) => (
                    <p className="is-error" key={error}>Error: {error}</p>
                  ))}
                  {result.warnings.map((warning) => (
                    <p className="is-warning" key={warning}>Warning: {warning}</p>
                  ))}
                </div>
              )}
              <dl className="syslog-result__grid">
                <div><dt>Format</dt><dd>{result.format}</dd></div>
                <div><dt>Priority</dt><dd>{displayValue(result.priority)}</dd></div>
                <div>
                  <dt>Facility</dt>
                  <dd>{displayValue(result.facility)} · {displayValue(result.facilityName)}</dd>
                </div>
                <div>
                  <dt>Severity</dt>
                  <dd>
                    <span className="severity-badge">
                      {displayValue(result.severity)} · {displayValue(result.severityName)}
                    </span>
                  </dd>
                </div>
                <div><dt>Timestamp</dt><dd>{displayValue(result.timestamp)}</dd></div>
                <div><dt>Hostname</dt><dd>{displayValue(result.hostname)}</dd></div>
                <div><dt>App / Tag</dt><dd>{displayValue(result.appName ?? result.tag)}</dd></div>
                <div><dt>Process ID</dt><dd>{displayValue(result.processId)}</dd></div>
                <div><dt>Message ID</dt><dd>{displayValue(result.messageId)}</dd></div>
              </dl>
              {result.structuredData.length > 0 && (
                <section className="syslog-result__structured-data" aria-label="Structured data">
                  <h3>Structured Data</h3>
                  {result.structuredData.map((element) => (
                    <div className="structured-data-card" key={element.id}>
                      <strong>{element.id}</strong>
                      {Object.entries(element.parameters).map(([key, value]) => (
                        <span key={key}>{key}: {value}</span>
                      ))}
                    </div>
                  ))}
                </section>
              )}
              <div className="syslog-result__message">
                <strong>Message body</strong>
                <p>{displayValue(result.message)}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
