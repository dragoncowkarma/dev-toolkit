import { useRef, useState } from 'react';
import { decodeBase64, decodeHex, parseDer, readFileBytes } from './asn1.utils.js';
import './asn1.css';

const INPUT_FORMATS = {
  HEX: 'hex',
  BASE64: 'base64',
};

function TreeNode({ node }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const summary = `${node.tagClass} ${node.tagName} (tag ${node.tagNumber})`;

  return (
    <li className="asn1-tree-node">
      <div className="asn1-node-card">
        {hasChildren ? (
          <button
            type="button"
            className="asn1-expand-button"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${summary}`}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? '−' : '+'}
          </button>
        ) : (
          <span className="asn1-node-spacer" aria-hidden="true" />
        )}
        <div>
          <strong>{summary}</strong>
          <dl className="asn1-node-details">
            <div>
              <dt>Form</dt>
              <dd>{node.constructed ? 'Constructed' : 'Primitive'}</dd>
            </div>
            <div>
              <dt>Length</dt>
              <dd>{node.length} byte(s)</dd>
            </div>
            <div className="asn1-node-value">
              <dt>Value</dt>
              <dd>{node.value}</dd>
            </div>
          </dl>
        </div>
      </div>
      {hasChildren && expanded && (
        <ul className="asn1-tree-children" aria-label={`${summary} children`}>
          {node.children.map((child) => (
            <TreeNode key={`${child.offset}-${child.tagNumber}`} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Renders a client-side ASN.1 DER decoder with text and binary-file input.
 *
 * @returns {React.JSX.Element} The ASN.1 DER decoder tool.
 */
export default function Asn1DecoderTool() {
  const [format, setFormat] = useState(INPUT_FORMATS.HEX);
  const [input, setInput] = useState('');
  const [nodes, setNodes] = useState([]);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  function inspectBytes(bytes) {
    try {
      setNodes(parseDer(bytes));
      setError('');
    } catch (parseError) {
      setNodes([]);
      setError(parseError.message);
    }
  }

  function handleDecode() {
    setFileName('');
    try {
      const bytes = format === INPUT_FORMATS.HEX ? decodeHex(input) : decodeBase64(input);
      inspectBytes(bytes);
    } catch (inputError) {
      setNodes([]);
      setError(inputError.message);
    }
  }

  function handleFormatChange(event) {
    fileRequestRef.current += 1;
    setFormat(event.target.value);
    setNodes([]);
    setError('');
    setFileName('');
  }

  function handleInputChange(event) {
    fileRequestRef.current += 1;
    setInput(event.target.value);
    setNodes([]);
    setError('');
    setFileName('');
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setInput('');
    setNodes([]);
    setError('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const requestId = (fileRequestRef.current += 1);
    try {
      const bytes = await readFileBytes(file);
      if (requestId !== fileRequestRef.current) return;
      setInput('');
      setFileName(file.name);
      inspectBytes(bytes);
    } catch {
      if (requestId !== fileRequestRef.current) return;
      setNodes([]);
      setError('Unable to read the selected binary file.');
    }
  }

  return (
    <section className="asn1-tool" aria-label="ASN.1 DER Decoder Tool">
      <div className="asn1-toolbar">
        <div className="asn1-format-control">
          <label htmlFor="asn1-format">Input format</label>
          <select
            id="asn1-format"
            value={format}
            onChange={handleFormatChange}
          >
            <option value={INPUT_FORMATS.HEX}>Hex</option>
            <option value={INPUT_FORMATS.BASE64}>Base64</option>
          </select>
        </div>
        <div className="asn1-toolbar-actions">
          <label className="asn1-button asn1-file-button">
            Upload binary file
            <input
              ref={fileInputRef}
              type="file"
              className="asn1-file-input"
              onChange={handleFileChange}
              aria-label="Upload a DER binary file"
            />
          </label>
          <button
            type="button"
            className="asn1-button asn1-primary-button"
            onClick={handleDecode}
          >
            Decode DER
          </button>
          <button type="button" className="asn1-button" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="asn1-panel">
        <label className="asn1-label" htmlFor="asn1-input">
          {format === INPUT_FORMATS.HEX ? 'DER hex' : 'DER Base64'}
        </label>
        <textarea
          id="asn1-input"
          className="asn1-textarea"
          value={input}
          onChange={handleInputChange}
          placeholder={
            format === INPUT_FORMATS.HEX
              ? '30 03 02 01 01'
              : 'MAMCAQE='
          }
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'asn1-error' : undefined}
        />
        {fileName && <p className="asn1-file-name">Inspecting uploaded file: {fileName}</p>}
      </div>

      {error && (
        <div id="asn1-error" className="asn1-error" role="alert">
          ⚠ {error}
        </div>
      )}

      {nodes.length > 0 && !error && (
        <div className="asn1-panel" aria-live="polite">
          <h2 className="asn1-tree-heading">DER structure</h2>
          <ul className="asn1-tree" aria-label="Decoded ASN.1 DER tree">
            {nodes.map((node) => (
              <TreeNode key={`${node.offset}-${node.tagNumber}`} node={node} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
