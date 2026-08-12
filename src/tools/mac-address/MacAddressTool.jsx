import { useMemo, useState } from 'react';
import {
  expandEui48ToEui64,
  inspectMacAddress,
  normalizeMacAddress,
} from './macAddress.utils.js';
import './macAddress.css';

const SAMPLE_MAC_ADDRESS = '00:1A:2B:3C:4D:5E';

/**
 * Renders a client-side EUI-48 formatter, EUI-64 converter, and bit inspector.
 * @returns {React.JSX.Element} The MAC address converter UI.
 */
export default function MacAddressTool() {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('');
  const normalized = useMemo(() => normalizeMacAddress(input), [input]);
  const expansion = useMemo(() => expandEui48ToEui64(input), [input]);
  const inspection = useMemo(() => inspectMacAddress(input), [input]);
  const error = input ? normalized.error : '';

  async function copyValue(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} copied to clipboard.`);
    } catch {
      setStatus('Clipboard access was unavailable.');
    }
  }

  function clearInput() {
    setInput('');
    setStatus('');
  }

  const outputFormats = normalized.formats
    ? [
      ['Colon', normalized.formats.colon],
      ['Hyphen', normalized.formats.hyphen],
      ['Cisco Dot', normalized.formats.ciscoDot],
      ['Bare Hex', normalized.formats.bareHex],
    ]
    : [];

  return (
    <section className="mac-address" aria-label="MAC address converter">
      <header className="mac-address__intro">
        <p className="mac-address__eyebrow">NETWORKING</p>
        <h2>MAC Address Converter</h2>
        <p>Format EUI-48 addresses, create EUI-64 identifiers, and inspect address bits.</p>
      </header>

      <div className="mac-address__input-panel">
        <label className="mac-address__input">
          MAC address
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'mac-address-error' : undefined}
            placeholder={SAMPLE_MAC_ADDRESS}
            spellCheck={false}
          />
        </label>
        <div className="mac-address__actions">
          <button type="button" onClick={() => setInput(SAMPLE_MAC_ADDRESS)}>Load sample</button>
          <button type="button" onClick={clearInput}>Clear</button>
        </div>
      </div>

      {error && <p id="mac-address-error" className="mac-address__error" role="alert">{error}</p>}

      {normalized.formats && (
        <>
          <section className="mac-address__results" aria-label="MAC address formats">
            {outputFormats.map(([label, value]) => (
              <article className="mac-address__result" key={label}>
                <span>{label}</span>
                <code>{value}</code>
                <button type="button" onClick={() => copyValue(value, label)}>
                  Copy {label}
                </button>
              </article>
            ))}
          </section>

          <section className="mac-address__details" aria-label="EUI-64 and bitwise inspection">
            <article className="mac-address__result">
              <span>Modified EUI-64</span>
              <code>{expansion.eui64}</code>
              <button type="button" onClick={() => copyValue(expansion.eui64, 'Modified EUI-64')}>
                Copy Modified EUI-64
              </button>
            </article>
            <article className="mac-address__inspection">
              <span>Address type</span>
              <strong>{inspection.inspection.addressType}</strong>
              <span>Administration</span>
              <strong>{inspection.inspection.administration}</strong>
              <span>OUI prefix</span>
              <code>{inspection.inspection.oui}</code>
            </article>
          </section>
        </>
      )}

      <p className="mac-address__status" role="status" aria-live="polite">{status}</p>
      <p className="mac-address__privacy">All processing happens locally in your browser.</p>
    </section>
  );
}
