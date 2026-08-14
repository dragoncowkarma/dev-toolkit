import { useEffect, useRef, useState } from 'react';
import { computeFingerprints, decodeOpenSshPublicKey } from './sshKeyInspector.utils.js';
import './sshKeyInspector.css';

function collectInputEntries(input) {
  const lines = input.split(/\r?\n/);
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (/-----BEGIN .*PRIVATE KEY-----/i.test(trimmed)) {
      const privateLines = [line];
      const endIndex = lines.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > index && /-----END .*PRIVATE KEY-----/i.test(candidate)
      );
      while (endIndex !== -1 && index < endIndex) {
        index += 1;
        privateLines.push(lines[index]);
      }
      entries.push({
        line: privateLines.join('\n'),
        error: 'Private keys are not supported. Paste a public key line.',
      });
      continue;
    }
    entries.push({ line, decoded: decodeOpenSshPublicKey(line) });
  }
  return entries;
}

/**
 * Renders offline inspection results for one or more OpenSSH public-key lines.
 * @param {object} props
 * @param {() => void} [props.onBack] - Returns to the tool dashboard.
 * @returns {React.JSX.Element} The SSH Key Fingerprint Inspector tool.
 */
export default function SshKeyInspectorTool({ onBack }) {
  const [input, setInput] = useState('');
  const [entries, setEntries] = useState([]);
  const [copyNotice, setCopyNotice] = useState('');
  const [copyError, setCopyError] = useState('');
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setCopyNotice('');
    setCopyError('');
    if (!input.trim()) {
      setEntries([]);
      return undefined;
    }
    const decodedEntries = collectInputEntries(input);
    Promise.all(decodedEntries.map(async (entry) => {
      if (entry.error || entry.decoded.error) {
        return { ...entry, error: entry.error || entry.decoded.error };
      }
      try {
        return { ...entry, fingerprints: await computeFingerprints(entry.decoded.blobBytes) };
      } catch {
        return { ...entry, error: 'Fingerprint calculation failed in this browser.' };
      }
    })).then((nextEntries) => {
      if (requestRef.current === requestId) setEntries(nextEntries);
    });
    return undefined;
  }, [input]);

  async function handleCopy(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyNotice(`Copied ${label} fingerprint.`);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
      setCopyNotice('');
    }
  }

  return (
    <section className="ssh-key-inspector" aria-label="SSH Key Fingerprint Inspector">
      {onBack && (
        <button className="ssh-key-inspector__back" type="button" onClick={onBack}>
          ← Back
        </button>
      )}
      <div className="ssh-key-inspector__intro">
        <h2>SSH Key Fingerprint Inspector</h2>
        <p>Decode public keys locally. Nothing leaves this browser.</p>
      </div>
      <label className="ssh-key-inspector__label" htmlFor="ssh-key-input">
        OpenSSH public keys
      </label>
      <textarea
        id="ssh-key-input"
        className="ssh-key-inspector__input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="ssh-ed25519 AAAA... laptop@example.com"
        spellCheck="false"
      />
      <p className="ssh-key-inspector__hint">
        One authorized_keys-style public key per line. Blank and # comment lines are ignored.
      </p>
      {copyNotice && <p className="ssh-key-inspector__notice" role="status">{copyNotice}</p>}
      {copyError && <p className="ssh-key-inspector__error" role="alert">{copyError}</p>}
      <div className="ssh-key-inspector__results" aria-live="polite">
        {entries.map((entry, index) => entry.error ? (
          <article className="ssh-key-inspector__failure" key={`${entry.line}-${index}`}>
            <code>{entry.line}</code>
            <p role="alert">{entry.error}</p>
          </article>
        ) : entry.fingerprints ? (
          <article className="ssh-key-inspector__card" key={`${entry.line}-${index}`}>
            <header>
              <h3>{entry.decoded.label}</h3>
              <p>
                {entry.decoded.bitSize}-bit
                {entry.decoded.curve ? ` · ${entry.decoded.curve}` : ''}
              </p>
            </header>
            {entry.decoded.comment && (
              <p className="ssh-key-inspector__comment">{entry.decoded.comment}</p>
            )}
            <FingerprintRow
              label="SHA-256"
              value={entry.fingerprints.sha256}
              onCopy={handleCopy}
            />
            <FingerprintRow label="MD5" value={entry.fingerprints.md5} onCopy={handleCopy} />
          </article>
        ) : null)}
      </div>
    </section>
  );
}

function FingerprintRow({ label, value, onCopy }) {
  return (
    <div className="ssh-key-inspector__fingerprint">
      <span>{label}</span>
      <code>{value}</code>
      <button type="button" onClick={() => onCopy(value, label)}>
        Copy {label}
      </button>
    </div>
  );
}
