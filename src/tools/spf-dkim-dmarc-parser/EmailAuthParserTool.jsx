import { useMemo, useState } from 'react';
import { parseEmailAuthenticationRecord } from './emailAuthParser.utils.js';
import './emailAuthParser.css';

const RECORD_TYPE_OPTIONS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'spf', label: 'SPF' },
  { value: 'dkim', label: 'DKIM' },
  { value: 'dmarc', label: 'DMARC' },
];

/**
 * Renders a client-side parser for SPF, DKIM, and DMARC TXT records.
 * @returns {React.JSX.Element} The email-authentication record parser UI.
 */
export default function EmailAuthParserTool() {
  const [input, setInput] = useState('');
  const [selectedType, setSelectedType] = useState('auto');
  const result = useMemo(
    () => (input ? parseEmailAuthenticationRecord(input, selectedType) : null),
    [input, selectedType]
  );

  return (
    <section className="email-auth-parser" aria-label="Email authentication TXT record parser">
      <div className="email-auth-parser__controls">
        <label className="email-auth-parser__field" htmlFor="record-type">
          Record type
          <select
            id="record-type"
            value={selectedType}
            onChange={(event) => setSelectedType(event.target.value)}
          >
            {RECORD_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="email-auth-parser__clear" onClick={() => setInput('')}>
          Clear
        </button>
      </div>

      <label className="email-auth-parser__field" htmlFor="email-auth-record">
        DNS TXT record
        <textarea
          id="email-auth-record"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="v=DMARC1; p=reject; rua=mailto:reports@example.com"
          spellCheck={false}
        />
      </label>

      {!result && <p className="email-auth-parser__empty">Paste a TXT record to inspect it.</p>}

      {result && (
        <div className="email-auth-parser__results">
          <h2>{result.recordType ? `${result.recordType.toUpperCase()} breakdown` : 'Results'}</h2>
          {result.mechanisms.length > 0 && (
            <section aria-labelledby="mechanisms-heading">
              <h3 id="mechanisms-heading">Mechanisms</h3>
              <ul className="email-auth-parser__list">
                {result.mechanisms.map((mechanism, index) => (
                  <li key={`${mechanism.name}-${index}`}>
                    <code>{mechanism.qualifier || '+'}{mechanism.name}</code>
                    {mechanism.value && (
                      <span> {mechanism.modifier ? '=' : ':'}{mechanism.value}</span>
                    )}
                    {mechanism.modifier && (
                      <span className="email-auth-parser__hint"> modifier</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {result.fields.length > 0 && (
            <section aria-labelledby="fields-heading">
              <h3 id="fields-heading">Fields</h3>
              <dl className="email-auth-parser__fields">
                {result.fields.map((field, index) => (
                  <div key={`${field.name}-${index}`}>
                    <dt>{field.name}</dt>
                    <dd>{field.value || '(empty)'}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {result.errors.length > 0 && (
            <section className="email-auth-parser__messages email-auth-parser__messages--error">
              <h3>Errors</h3>
              <ul>{result.errors.map((message) => <li key={message}>{message}</li>)}</ul>
            </section>
          )}
          {result.warnings.length > 0 && (
            <section className="email-auth-parser__messages email-auth-parser__messages--warning">
              <h3>Warnings</h3>
              <ul>{result.warnings.map((message) => <li key={message}>{message}</li>)}</ul>
            </section>
          )}
          {result.errors.length === 0 && result.warnings.length === 0 && (
            <p className="email-auth-parser__valid" role="status">No validation problems found.</p>
          )}
        </div>
      )}
    </section>
  );
}
