import { useEffect, useState } from 'react';
import { decodeMessagePack, formatDecodedTree, parsePayload } from './messagepackDecoder.utils.js';
import './messagepackDecoder.css';

const SAMPLE_HEX = '82a7636f6d70616374c3a6736368656d6100';

function TreeNode({ node, onCopy }) {
  const hasChildren = Boolean(node.children?.length || node.entries?.length);
  const [isOpen, setIsOpen] = useState(true);
  const timestamp = node.timestamp ? `; timestamp: ${node.timestamp}` : '';

  return (
    <li className="messagepack-decoder__node">
      <div className="messagepack-decoder__node-row">
        {hasChildren ? (
          <button
            type="button"
            className="messagepack-decoder__toggle"
            aria-expanded={isOpen}
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.type} at byte ${node.offset}`}
            onClick={() => setIsOpen((current) => !current)}
          >
            <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
          </button>
        ) : <span className="messagepack-decoder__toggle-placeholder" aria-hidden="true" />}
        <strong>{node.type}</strong>
        <span>byte {node.offset}</span>
        <code>{node.value}{timestamp}</code>
        <button
          type="button"
          className="messagepack-decoder__copy-value"
          aria-label={`Copy ${node.type} value at byte ${node.offset}`}
          onClick={() => onCopy(node.timestamp ? `${node.value}; ${node.timestamp}` : node.value)}
        >
          Copy
        </button>
      </div>
      {isOpen && node.children && (
        <ol className="messagepack-decoder__tree" aria-label={`Items in ${node.type}`}>
          {node.children.map((child) => (
            <TreeNode key={child.offset} node={child} onCopy={onCopy} />
          ))}
        </ol>
      )}
      {isOpen && node.entries && (
        <ol className="messagepack-decoder__tree" aria-label={`Entries in ${node.type}`}>
          {node.entries.map((entry, index) => (
            <li
              className="messagepack-decoder__entry"
              key={`${entry.key.offset}-${entry.value.offset}`}
            >
              <span>Entry {index + 1} key</span>
              <ol className="messagepack-decoder__tree">
                <TreeNode node={entry.key} onCopy={onCopy} />
              </ol>
              <span>Entry {index + 1} value</span>
              <ol className="messagepack-decoder__tree">
                <TreeNode node={entry.value} onCopy={onCopy} />
              </ol>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

/**
 * Renders a local self-describing MessagePack payload decoder.
 * @returns {React.JSX.Element} The MessagePack decoder interface.
 */
export default function MessagePackDecoderTool() {
  const [input, setInput] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('auto');
  const [resolvedFormat, setResolvedFormat] = useState('hex');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    if (!input.trim()) {
      setResult(null);
      setError('');
      return;
    }
    const parsed = parsePayload(input, selectedFormat);
    setResolvedFormat(parsed.format);
    if ('error' in parsed) {
      setResult(null);
      setError(parsed.error);
      return;
    }
    const decoded = decodeMessagePack(parsed.bytes);
    if ('error' in decoded) {
      setResult(null);
      setError(decoded.error);
      return;
    }
    setError('');
    setResult(decoded);
  }, [input, selectedFormat]);

  useEffect(() => {
    if (!copyStatus) return undefined;
    const timer = setTimeout(() => setCopyStatus(''), 1800);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  async function copy(value) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API is unavailable.');
      await navigator.clipboard.writeText(value);
      setCopyStatus('Copied to clipboard.');
    } catch {
      setCopyStatus('Failed to copy to clipboard.');
    }
  }

  function clear() {
    setInput('');
    setCopyStatus('');
  }

  return (
    <section className="messagepack-decoder" aria-label="MessagePack Decoder">
      <div className="messagepack-decoder__intro">
        <p>
          Decode self-describing MessagePack bytes locally. No schema, network call, or dependency.
        </p>
      </div>
      <div className="messagepack-decoder__controls">
        <label htmlFor="messagepack-format">Payload format</label>
        <select
          id="messagepack-format"
          value={selectedFormat}
          onChange={(event) => setSelectedFormat(event.target.value)}
        >
          <option value="auto">Auto</option>
          <option value="hex">Hex</option>
          <option value="base64">Base64 / Base64url</option>
        </select>
        <span className="messagepack-decoder__resolved">Resolved: {resolvedFormat}</span>
        <button type="button" onClick={() => setInput(SAMPLE_HEX)}>Load sample</button>
        <button type="button" onClick={clear}>Clear</button>
      </div>
      <label htmlFor="messagepack-payload">MessagePack payload</label>
      <textarea
        id="messagepack-payload"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Paste hexadecimal or Base64 payload bytes"
        spellCheck={false}
      />
      {error && <p className="messagepack-decoder__error" role="alert">{error}</p>}
      {copyStatus && (
        <p
          className={copyStatus.startsWith('Failed') ? 'messagepack-decoder__error' : ''}
          role={copyStatus.startsWith('Failed') ? 'alert' : 'status'}
          aria-live="polite"
        >
          {copyStatus}
        </p>
      )}
      {result && (
        <section
          className="messagepack-decoder__results"
          aria-labelledby="messagepack-results-heading"
        >
          <div className="messagepack-decoder__results-header">
            <h3 id="messagepack-results-heading">Decoded MessagePack tree</h3>
            <button type="button" onClick={() => copy(formatDecodedTree(result.node))}>
              Copy whole tree
            </button>
          </div>
          <ol className="messagepack-decoder__tree" aria-label="Decoded MessagePack value">
            <TreeNode node={result.node} onCopy={copy} />
          </ol>
        </section>
      )}
    </section>
  );
}
