import { useMemo, useState } from 'react';
import { calculateIPv6Subnet } from './ipv6Subnet.utils.js';
import './ipv6Subnet.css';

const DEFAULT_CIDR = '2001:db8::/32';
const INPUT_ERROR = 'Enter a valid IPv6 CIDR with a prefix from 0 to 128, such as '
  + '2001:db8::/32.';

/**
 * Renders a client-side IPv6 CIDR analysis tool.
 * @returns {React.JSX.Element} The IPv6 subnet calculator UI.
 */
export default function Ipv6SubnetCalculatorTool() {
  const [cidrInput, setCidrInput] = useState(DEFAULT_CIDR);
  const calculation = useMemo(() => calculateIPv6Subnet(cidrInput), [cidrInput]);
  const error = cidrInput && !calculation ? INPUT_ERROR : '';

  const results = calculation ? [
    ['Expanded Address', calculation.expandedAddress],
    ['Compressed Address', calculation.compressedAddress],
    ['Network Address', calculation.networkAddress],
    ['Prefix Length', `/${calculation.prefix}`],
    ['Total Addresses', calculation.totalAddresses.toString()],
    ['First Address', calculation.firstAddress],
    ['Last Address', calculation.lastAddress],
  ] : [];

  return (
    <section className="ipv6-subnet" aria-label="IPv6 subnet calculator">
      <header className="ipv6-subnet__intro">
        <p className="ipv6-subnet__eyebrow">NETWORKING</p>
        <h2>IPv6 Subnet Calculator</h2>
        <p>Analyze IPv6 CIDR blocks with precise 128-bit address arithmetic.</p>
      </header>

      <label className="ipv6-subnet__input">
        IPv6 CIDR notation
        <input
          value={cidrInput}
          onChange={(event) => setCidrInput(event.target.value)}
          aria-label="IPv6 CIDR notation"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'ipv6-subnet-error' : undefined}
          placeholder={DEFAULT_CIDR}
          spellCheck={false}
        />
      </label>

      {error && (
        <p id="ipv6-subnet-error" className="ipv6-subnet__error" role="alert">
          {error}
        </p>
      )}

      {calculation && (
        <section className="ipv6-subnet__results" aria-label="IPv6 subnet results">
          {results.map(([label, value]) => (
            <article className="ipv6-subnet__result" key={label}>
              <span>{label}</span>
              <code>{value}</code>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
