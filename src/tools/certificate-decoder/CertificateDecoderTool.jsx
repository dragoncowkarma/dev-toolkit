import { useMemo, useState } from 'react';
import {
  decodeCertificates,
  formatDuration,
  getValidityStatus,
} from './certificateDecoder.utils.js';
import { SAMPLE_CERTIFICATE } from './certificateDecoder.samples.js';
import './certificateDecoder.css';

const STATUS_LABELS = {
  valid: 'Valid',
  expired: 'Expired',
  'not-yet-valid': 'Not yet valid',
  invalid: 'Parse error',
};

/**
 * Renders a browser-only PEM/X.509 certificate inspector.
 *
 * @returns {React.JSX.Element} Certificate decoder interface.
 */
export default function CertificateDecoderTool() {
  const [input, setInput] = useState('');
  // Captured once per input change so every card in a chain is compared against
  // the same instant instead of drifting between renders.
  const [referenceTime, setReferenceTime] = useState(() => Date.now());

  const result = useMemo(() => {
    if (!input.trim()) return { state: 'empty' };
    try {
      return { state: 'decoded', results: decodeCertificates(input) };
    } catch (error) {
      return { state: 'invalid', error: error.message };
    }
  }, [input]);

  function handleInputChange(event) {
    setInput(event.target.value);
    setReferenceTime(Date.now());
  }

  function handleLoadSample() {
    setInput(SAMPLE_CERTIFICATE);
    setReferenceTime(Date.now());
  }

  const decodedCount = result.state === 'decoded'
    ? result.results.filter((entry) => entry.certificate).length
    : 0;

  return (
    <section className="cert-tool" aria-label="Certificate Decoder Tool">
      <div className="cert-tool__toolbar">
        <div>
          <p className="cert-tool__eyebrow">Certificate inspector</p>
          <p className="cert-tool__hint">
            Parsed in your browser. Nothing is uploaded, and signatures are not verified.
          </p>
        </div>
        <button type="button" className="cert-tool__button" onClick={handleLoadSample}>
          Load sample certificate
        </button>
      </div>

      <label className="cert-tool__label" htmlFor="cert-input">
        PEM certificate
      </label>
      <textarea
        id="cert-input"
        className="cert-tool__input"
        value={input}
        onChange={handleInputChange}
        placeholder="-----BEGIN CERTIFICATE-----&#10;MIIE…&#10;-----END CERTIFICATE-----"
        spellCheck={false}
      />

      <p className="cert-tool__status-line" role="status">
        {result.state === 'decoded'
          ? `${decodedCount} of ${result.results.length} certificate block(s) decoded.`
          : ''}
      </p>

      {result.state === 'empty' && (
        <p className="cert-tool__empty">
          Paste one or more PEM certificate blocks to inspect subject, issuer, validity, and
          extensions.
        </p>
      )}

      {result.state === 'invalid' && (
        <div className="cert-tool__alert" role="alert">
          <StatusBadge status="invalid" />
          <span>{result.error}</span>
        </div>
      )}

      {result.state === 'decoded' && (
        <div className="cert-tool__results">
          {result.results.map((entry) => (
            <CertificateCard key={entry.index} entry={entry} referenceTime={referenceTime} />
          ))}
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`cert-tool__status cert-tool__status--${status}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function CertificateCard({ entry, referenceTime }) {
  const position = entry.index + 1;

  if (entry.error) {
    return (
      <article className="cert-tool__card" aria-labelledby={`cert-${entry.index}-title`}>
        <h2 className="cert-tool__card-title" id={`cert-${entry.index}-title`}>
          Certificate {position}
        </h2>
        <div className="cert-tool__alert" role="alert">
          <StatusBadge status="invalid" />
          <span>{entry.error}</span>
        </div>
      </article>
    );
  }

  const certificate = entry.certificate;
  const validity = getValidityStatus(certificate.validity, referenceTime);
  const { publicKey, extensions } = certificate;

  return (
    <article className="cert-tool__card" aria-labelledby={`cert-${entry.index}-title`}>
      <header className="cert-tool__card-heading">
        <h2 className="cert-tool__card-title" id={`cert-${entry.index}-title`}>
          Certificate {position}
          {certificate.subject.commonName ? ` — ${certificate.subject.commonName}` : ''}
        </h2>
        <StatusBadge status={validity.status} />
      </header>

      <p className="cert-tool__validity-note">{describeValidity(validity)}</p>

      <dl className="cert-tool__fields">
        <Field label="Subject" value={certificate.subject.text} monospace />
        <Field label="Issuer" value={certificate.issuer.text} monospace />
        <Field label="Serial number" value={certificate.serialNumberGrouped} monospace />
        <Field label="Version" value={`v${certificate.version}`} />
        <Field
          label="Not before"
          value={certificate.validity.notBefore.utc}
          note={certificate.validity.notBefore.date.toLocaleString()}
        />
        <Field
          label="Not after"
          value={certificate.validity.notAfter.utc}
          note={certificate.validity.notAfter.date.toLocaleString()}
        />
        <Field
          label="Signature algorithm"
          value={certificate.signatureAlgorithm.name ?? 'Unrecognized algorithm'}
          note={certificate.signatureAlgorithm.oid}
        />
        <Field
          label="Public key"
          value={describePublicKey(publicKey)}
          note={publicKey.curveOid ?? publicKey.algorithmOid}
        />
        {extensions.basicConstraints && (
          <Field
            label="Basic constraints"
            value={extensions.basicConstraints.isCa ? 'CA: true' : 'CA: false'}
            note={
              extensions.basicConstraints.pathLength === null
                ? undefined
                : `Path length: ${extensions.basicConstraints.pathLength}`
            }
          />
        )}
        <Field
          label="Subject matches issuer"
          value={certificate.subjectMatchesIssuer ? 'Yes' : 'No'}
          note="Name comparison only — signatures are not verified."
        />
      </dl>

      {extensions.subjectAltNames.length > 0 && (
        <section
          className="cert-tool__section"
          aria-label={`Subject alternative names ${position}`}
        >
          <h3>Subject alternative names</h3>
          <ul className="cert-tool__tags">
            {extensions.subjectAltNames.map((name, nameIndex) => (
              <li key={`${name.type}-${name.value}-${nameIndex}`} className="cert-tool__tag">
                <span className="cert-tool__tag-type">{name.type}</span>
                <span className="cert-tool__tag-value">{name.value}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {extensions.all.length > 0 && (
        <section className="cert-tool__section" aria-label={`Extensions ${position}`}>
          <h3>Extensions</h3>
          <ul className="cert-tool__extensions">
            {extensions.all.map((extension) => (
              <li key={extension.oid}>
                <span className="cert-tool__extension-name">{extension.name ?? extension.oid}</span>
                <span className="cert-tool__extension-oid">{extension.oid}</span>
                {extension.critical && <span className="cert-tool__critical">critical</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function Field({ label, value, note, monospace = false }) {
  return (
    <div className="cert-tool__field">
      <dt>{label}</dt>
      <dd className={monospace ? 'cert-tool__field--mono' : undefined}>
        <span className="cert-tool__field-value">{value}</span>
        {note && <small>{note}</small>}
      </dd>
    </div>
  );
}

function describeValidity(validity) {
  if (validity.isExpired) {
    return `Expired ${formatDuration(validity.millisecondsUntilExpiry)} ago.`;
  }
  if (validity.isNotYetValid) {
    return `Becomes valid in ${formatDuration(validity.millisecondsUntilValid)}.`;
  }
  return `Currently valid — expires in ${formatDuration(validity.millisecondsUntilExpiry)}.`;
}

function describePublicKey(publicKey) {
  const parts = [publicKey.algorithm];
  if (publicKey.keySize) parts.push(`${publicKey.keySize} bit`);
  if (publicKey.curve) parts.push(publicKey.curve);
  return parts.join(' · ');
}
