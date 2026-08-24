import { useEffect, useRef, useState } from 'react';
import { decodeBson, parseBsonInput, readBsonFile } from '../bson-encoder/bson.utils.js';
import './bson-decoder.css';

/**
 * Renders a client-side BSON-to-JSON decoder for pasted bytes or uploaded files.
 * @returns {React.JSX.Element}
 */
export default function BsonDecoderTool() {
  const [input, setInput] = useState('');
  const [format, setFormat] = useState('auto');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (fileName || input.trim() === '') {
      if (!fileName) {
        setOutput('');
        setError('');
      }
      return;
    }
    try {
      const decoded = decodeBson(parseBsonInput(input, format));
      setOutput(JSON.stringify(decoded, null, 2));
      setError('');
    } catch (decodingError) {
      setOutput('');
      setError(decodingError.message);
    }
  }, [fileName, format, input]);

  function handleInputChange(event) {
    requestRef.current += 1;
    setFileName('');
    setInput(event.target.value);
  }

  function handleClear() {
    requestRef.current += 1;
    setInput('');
    setFileName('');
    setOutput('');
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const requestId = (requestRef.current += 1);
    try {
      const decoded = decodeBson(await readBsonFile(file));
      if (requestRef.current !== requestId) return;
      setInput('');
      setFileName(file.name);
      setOutput(JSON.stringify(decoded, null, 2));
      setError('');
    } catch (decodingError) {
      if (requestRef.current !== requestId) return;
      setFileName('');
      setOutput('');
      setError(decodingError.message);
    }
  }

  return (
    <section className="bson-decoder-tool" aria-label="BSON Decoder Tool">
      <div className="bson-decoder-toolbar">
        <label className="bson-decoder-format-label" htmlFor="bson-input-format">
          Input format
          <select
            id="bson-input-format"
            value={format}
            onChange={(event) => setFormat(event.target.value)}
          >
            <option value="auto">Auto-detect</option>
            <option value="hex">Hex</option>
            <option value="base64">Base64 / Base64URL</option>
          </select>
        </label>
        <div className="bson-decoder-actions">
          <label className="bson-decoder-button bson-decoder-file-button">
            Upload BSON file
            <input
              ref={fileInputRef}
              type="file"
              className="bson-decoder-file-input"
              onChange={handleFileChange}
              aria-label="Upload a BSON file"
            />
          </label>
          <button type="button" className="bson-decoder-button" onClick={handleClear}>Clear</button>
        </div>
      </div>

      {fileName && <p className="bson-decoder-file-name">Uploaded file: {fileName}</p>}

      <div className="bson-decoder-panels">
        <div className="bson-decoder-panel">
          <label className="bson-decoder-label" htmlFor="bson-bytes-input">BSON bytes</label>
          <textarea
            id="bson-bytes-input"
            className="bson-decoder-textarea"
            value={input}
            onChange={handleInputChange}
            placeholder="Paste BSON as hexadecimal, Base64, or Base64URL…"
            spellCheck={false}
          />
        </div>
        <div className="bson-decoder-panel">
          <label className="bson-decoder-label" htmlFor="bson-json-output">Formatted JSON</label>
          <textarea
            id="bson-json-output"
            className="bson-decoder-output"
            value={output}
            readOnly
            placeholder="Decoded JSON will appear here…"
            spellCheck={false}
          />
        </div>
      </div>

      {error && <p className="bson-decoder-error" role="alert" aria-live="polite">⚠ {error}</p>}
    </section>
  );
}
