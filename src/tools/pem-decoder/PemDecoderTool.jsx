import { useState } from 'react';
import { parseDer } from '../asn1-decoder/asn1.utils.js';
import { parsePemBlocks } from './pem.utils.js';
import './pem.css';

function TreeNode({ node }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const summary = `${node.tagClass} ${node.tagName} (tag ${node.tagNumber})`;

  return (
    <li className="pem-tree-node">
      <div className="pem-node-card">
        {hasChildren ? (
          <button
            type="button"
            className="pem-expand-button"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${summary}`}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? '−' : '+'}
          </button>
        ) : (
          <span className="pem-node-spacer" aria-hidden="true" />
        )}
        <div>
          <strong>{summary}</strong>
          <dl className="pem-node-details">
            <div><dt>Form</dt><dd>{node.constructed ? 'Constructed' : 'Primitive'}</dd></div>
            <div><dt>Length</dt><dd>{node.length} byte(s)</dd></div>
            <div className="pem-node-value"><dt>Value</dt><dd>{node.value}</dd></div>
          </dl>
        </div>
      </div>
      {hasChildren && expanded && (
        <ul className="pem-tree-children" aria-label={`${summary} children`}>
          {node.children.map((child) => (
            <TreeNode key={`${child.offset}-${child.tagNumber}`} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Renders a browser-local PEM envelope decoder with optional ASN.1 DER inspection.
 *
 * @returns {React.JSX.Element} The PEM decoder UI.
 */
export default function PemDecoderTool() {
  const [input, setInput] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [nodes, setNodes] = useState([]);
  const [error, setError] = useState('');

  function handleParse() {
    try {
      const parsedBlocks = parsePemBlocks(input);
      setBlocks(parsedBlocks);
      setSelectedIndex(0);
      setNodes([]);
      setError('');
    } catch (parseError) {
      setBlocks([]);
      setNodes([]);
      setError(parseError.message);
    }
  }

  function handleBlockChange(event) {
    setSelectedIndex(Number(event.target.value));
    setNodes([]);
    setError('');
  }

  function handleViewAsDer() {
    try {
      setNodes(parseDer(blocks[selectedIndex].bytes));
      setError('');
    } catch (parseError) {
      setNodes([]);
      setError(`Unable to decode this PEM payload as ASN.1 DER: ${parseError.message}`);
    }
  }

  function handleClear() {
    setInput('');
    setBlocks([]);
    setSelectedIndex(0);
    setNodes([]);
    setError('');
  }

  const selectedBlock = blocks[selectedIndex];

  return (
    <section className="pem-tool" aria-label="PEM Envelope Decoder Tool">
      <div className="pem-toolbar">
        <button type="button" className="pem-button pem-primary-button" onClick={handleParse}>
          Parse PEM
        </button>
        <button type="button" className="pem-button" onClick={handleClear}>Clear</button>
      </div>
      <div className="pem-panel">
        <label className="pem-label" htmlFor="pem-input">PEM text</label>
        <textarea
          id="pem-input"
          className="pem-textarea"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={'-----BEGIN CERTIFICATE-----\nMAMCAQE=\n-----END CERTIFICATE-----'}
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'pem-error' : undefined}
        />
      </div>

      {error && <div id="pem-error" className="pem-error" role="alert">⚠ {error}</div>}

      {selectedBlock && !error && (
        <div className="pem-panel" aria-live="polite">
          <label className="pem-label" htmlFor="pem-block-select">Decoded PEM block</label>
          <div className="pem-block-actions">
            <select id="pem-block-select" value={selectedIndex} onChange={handleBlockChange}>
              {blocks.map((block, index) => (
                <option key={`${block.label}-${index}`} value={index}>
                  {index + 1}. {block.label} ({block.bytes.length} byte(s))
                </option>
              ))}
            </select>
            <button
              type="button"
              className="pem-button pem-primary-button"
              onClick={handleViewAsDer}
            >
              View as ASN.1 DER
            </button>
          </div>
          <p className="pem-byte-count">
            Extracted {selectedBlock.bytes.length} raw byte(s) locally.
          </p>
        </div>
      )}

      {nodes.length > 0 && !error && (
        <div className="pem-panel" aria-live="polite">
          <h2 className="pem-tree-heading">DER structure</h2>
          <ul className="pem-tree" aria-label="Decoded ASN.1 DER tree">
            {nodes.map((node) => <TreeNode key={`${node.offset}-${node.tagNumber}`} node={node} />)}
          </ul>
        </div>
      )}
    </section>
  );
}
