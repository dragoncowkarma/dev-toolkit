/* eslint-disable max-len */
import { useRef, useState } from 'react';
import { inspectParquetFile } from './parquet.utils.js';
import './parquet.css';

function SchemaNode({ node }) {
  if (!node) return <p>No schema elements found.</p>;
  return (
    <li>
      <strong>{node.name ?? '(unnamed)'}</strong> {node.type ?? 'group'}
      {' '}({node.repetition ?? 'unknown'})
      <ul>{node.children.map((child, index) => (
        <SchemaNode key={`${child.name}-${index}`} node={child} />
      ))}</ul>
    </li>
  );
}

/** Renders the local-only Apache Parquet footer metadata inspector. */
export default function ParquetFooterInspectorTool() {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const requestRef = useRef(0);
  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const request = ++requestRef.current;
    setFileName(file.name);
    setResult(null);
    const next = await inspectParquetFile(file);
    if (request === requestRef.current) setResult(next);
  }
  const metadata = result?.metadata;
  return (
    <section className="parquet-tool" aria-label="Apache Parquet Footer Inspector">
      <label className="parquet-tool__picker">
        Choose a local .parquet file
        <input
          type="file"
          accept=".parquet,application/octet-stream"
          onChange={handleFile}
          aria-label="Choose a Parquet file"
        />
      </label>
      <p className="parquet-tool__privacy">
        Files are parsed only in this browser; column data is never decoded.
      </p>
      {fileName && <p>Inspecting: <strong>{fileName}</strong></p>}
      {result?.error && <div className="parquet-tool__error" role="alert">⚠ {result.error}</div>}
      {result?.warnings.map((warning) => (
        <div className="parquet-tool__warning" role="alert" key={warning}>⚠ {warning}</div>
      ))}
      {metadata && <div className="parquet-tool__results">
        <h3>File metadata</h3>
        <dl><dt>Version</dt><dd>{metadata.version ?? 'Unavailable'}</dd>
          <dt>Created by</dt><dd>{metadata.createdBy ?? 'Unavailable'}</dd>
          <dt>Rows</dt><dd>{metadata.numRows ?? 'Unavailable'}</dd>
          <dt>Row groups</dt><dd>{metadata.rowGroups.length}</dd></dl>
        <h3>Schema</h3>
        <ul className="parquet-tool__schema"><SchemaNode node={metadata.schema} /></ul>
        <h3>Row groups</h3>
        {metadata.rowGroups.map((group, groupIndex) => <section className="parquet-tool__group"
          key={groupIndex}>
          <h4>Row group {groupIndex + 1}</h4>
          <dl><dt>Total byte size</dt><dd>{group.totalByteSize ?? 'Unavailable'}</dd>
            <dt>Rows</dt><dd>{group.numRows ?? 'Unavailable'}</dd>
            <dt>Column chunks</dt><dd>{group.columnChunks.length}</dd></dl>
          {group.columnChunks.map((column, index) => <dl key={index}>
            <dt>Column {index + 1} codec</dt><dd>{column.codec ?? 'Unavailable'}</dd>
            <dt>Encodings</dt><dd>{column.encodings?.join(', ') || 'Unavailable'}</dd>
            <dt>Compressed / uncompressed</dt>
            <dd>{column.compressedSize ?? 'Unavailable'} / {column.uncompressedSize ?? 'Unavailable'}</dd>
          </dl>)}
        </section>)}
        {metadata.keyValueMetadata.length > 0 && <><h3>Key/value metadata</h3><dl>
          {metadata.keyValueMetadata.map((entry, index) => <div key={`${entry.key}-${index}`}>
            <dt>{entry.key ?? '(missing key)'}</dt><dd>{entry.value ?? '(no value)'}</dd>
          </div>)}
        </dl></>}
      </div>}
    </section>
  );
}
