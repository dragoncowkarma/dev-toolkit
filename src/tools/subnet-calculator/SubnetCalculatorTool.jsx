import { useEffect, useMemo, useState } from 'react';
import {
  calculateSubnet,
  maskFromPrefix,
  parseCidr,
  parseIPv4,
  prefixFromMask,
} from './subnetUtils.js';
import './subnet.css';

const DEFAULT_ADDRESS = '192.168.1.10';
const DEFAULT_PREFIX = 24;
const PRESETS = [24, 16, 8, 30];
const TOAST_DURATION_MS = 1800;

function maskTextForPrefix(prefix) {
  const mask = maskFromPrefix(prefix);
  return mask === null ? '' : [24, 16, 8, 0]
    .map((shift) => Math.floor(mask / (2 ** shift)) % 256)
    .join('.');
}

/**
 * Renders a synchronized IPv4 CIDR and subnet mask calculator.
 * @returns {React.JSX.Element} The subnet calculator UI.
 */
export default function SubnetCalculatorTool() {
  const [address, setAddress] = useState(DEFAULT_ADDRESS);
  const [prefix, setPrefix] = useState(DEFAULT_PREFIX);
  const [cidrInput, setCidrInput] = useState(`${DEFAULT_ADDRESS}/${DEFAULT_PREFIX}`);
  const [maskInput, setMaskInput] = useState(maskTextForPrefix(DEFAULT_PREFIX));
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const calculation = useMemo(() => calculateSubnet(address, prefix), [address, prefix]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function applyAddressAndPrefix(nextAddress, nextPrefix) {
    setAddress(nextAddress);
    setPrefix(nextPrefix);
    setCidrInput(`${nextAddress}/${nextPrefix}`);
    setMaskInput(maskTextForPrefix(nextPrefix));
    setError('');
  }

  function handleCidrChange(event) {
    const value = event.target.value;
    setCidrInput(value);
    const parsed = parseCidr(value);
    if (!parsed) {
      setError(value
        ? 'Enter an IPv4 address and prefix from 0 to 32, such as 192.168.1.10/24.'
        : '');
      return;
    }
    applyAddressAndPrefix(parsed.address, parsed.prefix);
  }

  function handleAddressChange(event) {
    const value = event.target.value;
    setAddress(value);
    const parsed = parseIPv4(value);
    if (!parsed) {
      setCidrInput(value ? `${value}/${prefix}` : '');
      setError(value ? 'Enter an IPv4 address with four octets from 0 to 255.' : '');
      return;
    }
    applyAddressAndPrefix(parsed.address, prefix);
  }

  function handleMaskChange(event) {
    const value = event.target.value;
    setMaskInput(value);
    const nextPrefix = prefixFromMask(value);
    if (nextPrefix === null) {
      setError(value ? 'Enter a contiguous IPv4 subnet mask, such as 255.255.255.0.' : '');
      return;
    }
    if (!parseIPv4(address)) {
      setError('Enter a valid IPv4 address before selecting a subnet mask.');
      return;
    }
    applyAddressAndPrefix(address, nextPrefix);
  }

  function handlePreset(prefixValue) {
    const parsedAddress = parseIPv4(address);
    if (!parsedAddress) {
      setError('Enter a valid IPv4 address before applying a prefix preset.');
      return;
    }
    applyAddressAndPrefix(parsedAddress.address, prefixValue);
  }

  async function copyValue(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setToast(`${label} copied to clipboard.`);
    } catch {
      setError('Clipboard access was unavailable.');
    }
  }

  const results = calculation ? [
    ['Network Address', calculation.networkAddress],
    ['Broadcast Address', calculation.broadcastAddress],
    ['Usable Host Range', `${calculation.firstUsableHost} – ${calculation.lastUsableHost}`],
    ['CIDR Notation', calculation.cidr],
  ] : [];

  return (
    <section className="subnet-calculator" aria-label="IPv4 subnet calculator">
      <header className="subnet-calculator__intro">
        <p className="subnet-calculator__eyebrow">NETWORKING</p>
        <h2>IPv4 Subnet Calculator</h2>
        <p>Calculate CIDR ranges, masks, address capacity, and IP address details in real time.</p>
      </header>

      <div className="subnet-calculator__inputs" role="group" aria-label="Subnet inputs">
        <label className="subnet-calculator__input subnet-calculator__input--wide">
          CIDR notation
          <input
            value={cidrInput}
            onChange={handleCidrChange}
            aria-label="CIDR notation"
            placeholder="192.168.1.10/24"
            spellCheck={false}
          />
        </label>
        <label className="subnet-calculator__input">
          IP address
          <input
            value={address}
            onChange={handleAddressChange}
            aria-label="IP address"
            placeholder="192.168.1.10"
            inputMode="decimal"
            spellCheck={false}
          />
        </label>
        <label className="subnet-calculator__input">
          Subnet mask
          <input
            value={maskInput}
            onChange={handleMaskChange}
            aria-label="Subnet mask"
            placeholder="255.255.255.0"
            inputMode="decimal"
            spellCheck={false}
          />
        </label>
      </div>

      <div className="subnet-calculator__presets" role="group" aria-label="CIDR prefix presets">
        <span>Common prefixes</span>
        {PRESETS.map((preset) => (
          <button key={preset} type="button" onClick={() => handlePreset(preset)}>
            /{preset}
          </button>
        ))}
      </div>

      {error && <p className="subnet-calculator__error" role="alert">{error}</p>}

      {calculation && (
        <>
          <section className="subnet-calculator__results" aria-label="Subnet calculation results">
            {results.map(([label, value]) => (
              <article className="subnet-calculator__result" key={label}>
                <span>{label}</span>
                <code>{value}</code>
                <button
                  type="button"
                  onClick={() => copyValue(value, label)}
                  aria-label={`Copy ${label}`}
                >
                  Copy
                </button>
              </article>
            ))}
          </section>

          <section className="subnet-calculator__details" aria-label="Subnet details">
            <article>
              <span>Total Addresses</span>
              <strong>{calculation.totalAddresses.toLocaleString()}</strong>
            </article>
            <article>
              <span>Usable Host Count</span>
              <strong>{calculation.usableHostCount.toLocaleString()}</strong>
            </article>
            <article><span>Subnet Mask</span><code>{calculation.subnetMask}</code></article>
            <article><span>Wildcard Mask</span><code>{calculation.wildcardMask}</code></article>
            <article>
              <span>IP Address Class</span>
              <strong>Class {calculation.addressClass}</strong>
            </article>
            <article><span>Address Type</span><strong>{calculation.addressType}</strong></article>
          </section>
        </>
      )}

      <p className="subnet-calculator__status" role="status" aria-live="polite">{toast}</p>
    </section>
  );
}
