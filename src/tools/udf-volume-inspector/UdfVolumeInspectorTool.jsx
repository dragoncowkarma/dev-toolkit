import { useRef, useState } from 'react';
import { inspectUdf } from './udf.utils.js';
import './udf-volume-inspector.css';

/** Render an offline UDF volume descriptor inspector. */
export default function UdfVolumeInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const request = useRef(0);

  async function selectFile(event) {
    const file = event.target.files?.[0];
    const id = ++request.current;
    setResult(null);
    setError('');
    setName('');
    if (!file) return;
    try {
      const parsed = await inspectUdf(file);
      if (request.current === id) { setResult(parsed); setName(file.name); }
    } catch (err) {
      if (request.current === id) setError(err.message);
    }
  }

  const fields = result && [
    ['File', name], ['File size', `${result.fileSize.toLocaleString()} bytes`],
    ['Recognition', result.nsr], ['Anchor tag identifier', result.anchor.identifier],
    ['Anchor tag checksum', result.anchor.checksum], ['Anchor tag serial', result.anchor.serial],
    ['Anchor tag location', result.anchor.location],
    ['Main extent location', `${result.extentLocation} (sector)`],
    ['Main extent length', `${result.extentLength} bytes`],
    ['Volume identifier', result.primary?.volumeIdentifier || 'Not present'],
    ['Volume set identifier', result.primary?.volumeSetIdentifier || 'Not present'],
    ['Recording date/time', result.primary?.recordingDateTime || 'Not present'],
    ['UDF revision', result.revision || 'Not present'],
  ];
  return (
    <section className="udf-inspector" aria-label="UDF Volume Inspector">
      <p>Inspect a UDF image locally in your browser.</p>
      <label htmlFor="udf-file">Select an image file</label>
      <input id="udf-file" type="file" onChange={selectFile} />
      {error && <p className="udf-inspector__error" role="alert">{error}</p>}
      {fields && (
        <dl>{fields.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}</dl>
      )}
    </section>
  );
}
