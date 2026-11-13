import { useRef, useState } from 'react';
import {
  formatFileSize,
  identifyFileSignature,
  readFileHeader,
} from './fileSignatureIdentifier.utils.js';
import './fileSignatureIdentifier.css';

/**
 * Renders a fully local file signature identifier that inspects a small file header only.
 *
 * @returns {React.JSX.Element} The file signature identifier UI.
 */
export default function FileSignatureIdentifierTool() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const requestRef = useRef(0);

  async function inspectFile(selectedFile) {
    if (!selectedFile) return;
    const requestId = (requestRef.current += 1);
    setFile(selectedFile);
    setResult(null);
    setError('');

    try {
      const header = await readFileHeader(selectedFile);
      if (requestRef.current !== requestId) return;
      setResult(identifyFileSignature(header));
    } catch {
      if (requestRef.current === requestId) {
        setError('Could not read the selected file header. Please try another file.');
      }
    }
  }

  function handleFileChange(event) {
    inspectFile(event.target.files?.[0]);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    inspectFile(event.dataTransfer.files?.[0]);
  }

  function handleClear() {
    requestRef.current += 1;
    setFile(null);
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="file-signature-identifier" aria-label="File Signature Identifier">
      <div
        className={`file-signature-identifier__dropzone ${isDragging ? 'is-dragging' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <p className="file-signature-identifier__heading">Identify a file by its magic bytes</p>
        <p className="file-signature-identifier__copy">
          Drop a file here or choose one. Only its first 512 bytes are read in your browser.
        </p>
        <label className="file-signature-identifier__button">
          Choose file
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            aria-label="Choose a file to identify"
          />
        </label>
      </div>

      {file && (
        <div className="file-signature-identifier__file">
          <span>{file.name} ({formatFileSize(file.size)})</span>
          <button type="button" onClick={handleClear}>Clear</button>
        </div>
      )}

      {error && <div className="file-signature-identifier__error" role="alert">{error}</div>}

      {file && !error && (
        <div className="file-signature-identifier__result" aria-live="polite">
          {result ? (
            <>
              <p className="file-signature-identifier__label">Detected format</p>
              <h2>{result.name}</h2>
              <dl>
                <div><dt>Signature</dt><dd>{result.hex}</dd></div>
                <div><dt>Offset</dt><dd>{result.offset} bytes</dd></div>
                <div><dt>Description</dt><dd>{result.description}</dd></div>
              </dl>
            </>
          ) : (
            <>
              <p className="file-signature-identifier__label">Detected format</p>
              <h2>Unknown / no match</h2>
              <p>No supported magic-number signature was found in the inspected header.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
