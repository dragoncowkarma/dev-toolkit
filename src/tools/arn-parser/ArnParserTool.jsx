import { useMemo, useState } from 'react';
import { parseArnBatch } from './arnParser.utils.js';
import './arn-parser.css';

const SAMPLE_ARNS = [
  'arn:aws:iam::123456789012:role/path/to/role',
  'arn:aws:s3:::my-bucket/path/to/object.txt',
  'arn:aws:lambda:us-east-1:123456789012:function:my-function',
  'arn:aws:dynamodb:us-east-1:123456789012:table/my-table',
  'arn:aws:logs:us-east-1:123456789012:log-group:/my/log-group:*',
].join('\n');

const FIELDS = [
  { key: 'partition', label: 'Partition' },
  { key: 'service', label: 'Service' },
  { key: 'region', label: 'Region' },
  { key: 'accountId', label: 'Account ID' },
  { key: 'resourceType', label: 'Resource Type' },
  { key: 'resourceId', label: 'Resource ID' },
];

/**
 * Renders an offline AWS ARN parser and validator, supporting one ARN per
 * line for batch inspection.
 *
 * @returns {React.JSX.Element} The ARN parser tool component.
 */
export default function ArnParserTool() {
  const [input, setInput] = useState('');

  const entries = useMemo(() => parseArnBatch(input), [input]);

  function handleLoadSamples() {
    setInput(SAMPLE_ARNS);
  }

  function handleClear() {
    setInput('');
  }

  return (
    <section className="arn-parser" aria-label="AWS ARN parser">
      <header className="arn-parser__intro">
        <p className="arn-parser__eyebrow">AWS ARN</p>
        <h2>ARN Parser &amp; Validator</h2>
        <p>
          Parse and validate AWS Resource Names (ARNs) into partition, service, region,
          account ID, and resource parts entirely offline. Paste one ARN per line to check
          several at once.
        </p>
      </header>

      <section className="arn-parser__panel" aria-labelledby="arn-parser-input-heading">
        <div className="arn-parser__heading">
          <h3 id="arn-parser-input-heading">ARNs</h3>
          <div className="arn-parser__actions">
            <button type="button" onClick={handleLoadSamples}>
              Load samples
            </button>
            <button type="button" onClick={handleClear}>
              Clear
            </button>
          </div>
        </div>

        <label className="arn-parser__field" htmlFor="arn-parser-input">
          One ARN per line
          <textarea
            id="arn-parser-input"
            className="arn-parser__textarea"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={'arn:aws:iam::123456789012:role/path/to/role'}
            spellCheck={false}
            rows={6}
          />
        </label>
      </section>

      {entries.length > 0 && (
        <ul className="arn-parser__results" aria-label="Parsed ARN results">
          {entries.map(({ line, lineNumber, result }) => (
            <li
              key={`${lineNumber}-${line}`}
              className={`arn-parser__result ${
                result.isValid ? 'arn-parser__result--valid' : 'arn-parser__result--invalid'
              }`}
            >
              <div className="arn-parser__result-header">
                <span className="arn-parser__result-line">Line {lineNumber}</span>
                <span
                  className={`arn-parser__badge ${
                    result.isValid ? 'arn-parser__badge--valid' : 'arn-parser__badge--invalid'
                  }`}
                >
                  {result.isValid ? '✓ Valid' : '✕ Invalid'}
                </span>
              </div>

              <code className="arn-parser__raw">{line}</code>

              {result.errors.length > 0 && (
                <ul className="arn-parser__messages arn-parser__messages--error" role="alert">
                  {result.errors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}

              {result.warnings.length > 0 && (
                <ul className="arn-parser__messages arn-parser__messages--warning">
                  {result.warnings.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}

              {result.isValid && (
                <div className="arn-parser__grid" aria-label="Parsed ARN components">
                  {FIELDS.map(({ key, label }) => (
                    <div className="arn-parser__grid-item" key={key}>
                      <span className="arn-parser__grid-label">{label}</span>
                      <span className="arn-parser__grid-value">
                        {result[key] === null || result[key] === '' ? (
                          <em>(none)</em>
                        ) : (
                          result[key]
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="arn-parser__privacy">
        Offline parsing and validation only; no ARN data is sent over the network.
      </p>
    </section>
  );
}
