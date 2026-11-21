import { useRef, useState } from 'react';
import { formatZstdValue, parseZstdFrameHeader } from './zstd-header.utils.js';
import './zstd-header-inspector.css';

function DescriptorFields({ descriptor }) {
  if (!descriptor) return null;
  return (
    <dl className="zstd-header-inspector__fields">
      <dt>Frame Content Size flag</dt><dd>{descriptor.frameContentSizeFlag}</dd>
      <dt>Single Segment flag</dt><dd>{formatZstdValue(descriptor.singleSegment)}</dd>
      <dt>Unused bit</dt><dd>{formatZstdValue(descriptor.unusedBit)}</dd>
      <dt>Reserved bit</dt><dd>{formatZstdValue(descriptor.reservedBit)}</dd>
      <dt>Content Checksum flag</dt><dd>{formatZstdValue(descriptor.contentChecksumFlag)}</dd>
      <dt>Dictionary ID flag</dt><dd>{descriptor.dictionaryIdFlag}</dd>
    </dl>
  );
}

/**
 * Renders a client-side inspector for Zstandard plaintext frame headers.
 *
 * @returns {React.JSX.Element} The Zstandard header inspector.
 */
export default function ZstdHeaderInspectorTool() {
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      setResult(parseZstdFrameHeader(await file.arrayBuffer()));
    } catch {
      setResult({ status: 'error', fields: {}, warnings: ['Failed to read the selected file.'] });
    }
  }

  function handleClear() {
    setFileName('');
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const fields = result?.fields ?? {};
  return (
    <section className="zstd-header-inspector" aria-label="Zstandard Frame Header Inspector">
      <p className="zstd-header-inspector__intro">
        Reads only the plaintext Zstandard frame header in your browser. Files are not uploaded.
      </p>
      <div className="zstd-header-inspector__actions">
        <label className="zstd-header-inspector__upload">
          Choose zstd file
          <input ref={inputRef} type="file" onChange={handleFileChange} />
        </label>
        <button type="button" onClick={handleClear}>Clear</button>
      </div>
      {fileName && <p className="zstd-header-inspector__filename">Inspecting: {fileName}</p>}
      {result && (
        <div className="zstd-header-inspector__result">
          <p><strong>Status:</strong> {result.status}</p>
          {fields.magicNumber && <p><strong>Magic Number:</strong> {fields.magicNumber}</p>}
          {result.status === 'skippable' && (
            <p><strong>Skippable Frame ID:</strong> {fields.skippableFrameId}</p>
          )}
          <DescriptorFields descriptor={fields.frameHeaderDescriptor} />
          {fields.windowDescriptor && (
            <p>
              <strong>Window Descriptor:</strong> {fields.windowDescriptor.raw}
              {' '}(window size {fields.windowDescriptor.windowSize})
            </p>
          )}
          {fields.dictionaryId !== undefined && (
            <p>
              <strong>Dictionary ID:</strong> {formatZstdValue(fields.dictionaryId)}
              {' '}({fields.dictionaryIdByteLength} bytes)
            </p>
          )}
          {fields.frameContentSize !== undefined && (
            <p>
              <strong>Frame Content Size:</strong> {formatZstdValue(fields.frameContentSize)}
              {' '}({fields.frameContentSizeByteLength} bytes)
            </p>
          )}
          {result.warnings.map((warning) => (
            <p className="zstd-header-inspector__warning" role="alert" key={warning}>
              ⚠ {warning}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
