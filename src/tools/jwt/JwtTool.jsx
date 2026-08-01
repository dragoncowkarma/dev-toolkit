import { useEffect, useMemo, useState } from 'react';
import { formatDuration, getJwtTimeDetails, parseJwt } from './jwt.utils.js';
import './jwt.css';

const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiJkZXYtdG9vbGtpdCIsIm5hbWUiOiJTYW1wbGUg' +
  'VXNlciIsImlhdCI6MTcxOTc5MjAwMCwiZXhwIjo0MTAyNDQ0ODAwfQ' +
  '.' +
  'signature';

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function formatTimestamp(timestamp) {
  return timestamp.date.toLocaleString();
}

/**
 * Renders a browser-only JWT decoder with time-claim inspection.
 *
 * @returns {React.JSX.Element} JWT decoder interface.
 */
export default function JwtTool() {
  const [input, setInput] = useState('');
  const [copiedSection, setCopiedSection] = useState('');
  const [copyError, setCopyError] = useState('');
  const [now, setNow] = useState(Date.now());

  const result = useMemo(() => {
    if (!input.trim()) return { state: 'empty' };
    try {
      const decoded = parseJwt(input);
      return { state: 'decoded', ...decoded, timeDetails: getJwtTimeDetails(decoded.payload, now) };
    } catch (error) {
      return { state: 'invalid', error: error.message };
    }
  }, [input, now]);

  useEffect(() => {
    if (result.state !== 'decoded') return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [result.state]);

  useEffect(() => {
    if (!copiedSection) return undefined;
    const timer = setTimeout(() => setCopiedSection(''), 1500);
    return () => clearTimeout(timer);
  }, [copiedSection]);

  async function handleCopy(section, value) {
    try {
      await navigator.clipboard.writeText(formatJson(value));
      setCopiedSection(section);
      setCopyError('');
    } catch {
      setCopyError('Could not copy JSON to the clipboard.');
    }
  }

  return (
    <section className="jwt-tool" aria-label="JWT Decoder Tool">
      <div className="jwt-tool__toolbar">
        <div>
          <p className="jwt-tool__eyebrow">Token inspector</p>
          <p className="jwt-tool__hint">Decoded locally. This tool does not verify signatures.</p>
        </div>
        <button type="button" className="jwt-tool__button" onClick={() => setInput(SAMPLE_JWT)}>
          Load sample JWT
        </button>
      </div>

      <label className="jwt-tool__label" htmlFor="jwt-input">JWT token</label>
      <textarea
        id="jwt-input"
        className="jwt-tool__input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Paste a header.payload.signature token…"
        spellCheck={false}
      />

      {result.state === 'empty' && (
        <p className="jwt-tool__empty">
          Paste a JWT to inspect its header, payload, and time claims.
        </p>
      )}

      {result.state === 'invalid' && (
        <div className="jwt-tool__alert" role="alert">
          <StatusBadge status="invalid" />
          <span>{result.error}</span>
        </div>
      )}

      {result.state === 'decoded' && (
        <DecodedToken result={result} copiedSection={copiedSection} onCopy={handleCopy} />
      )}

      {copyError && <p className="jwt-tool__copy-error" role="alert">{copyError}</p>}
    </section>
  );
}

function getStatus(result) {
  if (result.state === 'invalid') return 'invalid';
  if (result.state === 'decoded' && result.timeDetails.isExpired) return 'expired';
  if (result.state === 'decoded' && result.timeDetails.isNotActive) return 'not-active';
  return 'valid';
}

function StatusBadge({ status }) {
  const labels = {
    valid: 'Valid',
    expired: 'Expired',
    invalid: 'Invalid Format',
    'not-active': 'Not Active',
  };
  return <span className={`jwt-tool__status jwt-tool__status--${status}`}>{labels[status]}</span>;
}

function DecodedToken({ result, copiedSection, onCopy }) {
  const { header, payload, signature, timeDetails } = result;
  const status = getStatus(result);

  return (
    <div className="jwt-tool__result">
      <div className="jwt-tool__status-row">
        <StatusBadge status={status} />
        <span className="jwt-tool__algorithm">
          Algorithm: {String(header.alg ?? 'Not specified')}
        </span>
      </div>

      <div className="jwt-tool__panels">
        <JsonPanel
          label="Header"
          value={header}
          section="header"
          copiedSection={copiedSection}
          onCopy={onCopy}
        />
        <JsonPanel
          label="Payload"
          value={payload}
          section="payload"
          copiedSection={copiedSection}
          onCopy={onCopy}
        />
      </div>

      <section className="jwt-tool__details" aria-label="JWT token details">
        <h2>Token details</h2>
        <dl>
          <div>
            <dt>Signature</dt>
            <dd className="jwt-tool__signature">{signature || 'Empty (unsigned)'}</dd>
          </div>
          <TimeDetail label="Expires" timestamp={timeDetails.expiration} suffix="remaining" />
          <TimeDetail label="Issued at" timestamp={timeDetails.issuedAt} />
          <TimeDetail label="Not before" timestamp={timeDetails.notBefore} suffix="until active" />
        </dl>
      </section>
    </div>
  );
}

function JsonPanel({ label, value, section, copiedSection, onCopy }) {
  return (
    <section className="jwt-tool__panel" aria-labelledby={`jwt-${section}-title`}>
      <div className="jwt-tool__panel-heading">
        <h2 id={`jwt-${section}-title`}>{label}</h2>
        <button type="button" className="jwt-tool__button" onClick={() => onCopy(section, value)}>
          {copiedSection === section ? 'Copied' : `Copy ${label}`}
        </button>
      </div>
      <pre className="jwt-tool__json">{formatJson(value)}</pre>
    </section>
  );
}

function TimeDetail({ label, timestamp, suffix }) {
  if (!timestamp) return null;
  const duration = formatDuration(timestamp.milliseconds);
  const relationship = timestamp.milliseconds < 0 ? 'ago' : suffix ?? 'from now';

  return (
    <div>
      <dt>{label}</dt>
      <dd>{formatTimestamp(timestamp)} <small>({duration} {relationship})</small></dd>
    </div>
  );
}
