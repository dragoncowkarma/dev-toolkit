import { useEffect, useRef, useState } from 'react';
import { parseGenesisRom } from './genesis.utils.js';
import './genesis.css';

const hex = (value, width) => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;

/** Render the local Genesis ROM header inspector. */
export default function GenesisRomHeaderTool() {
  const [header, setHeader] = useState(null);
  const [error, setError] = useState('');
  const [filename, setFilename] = useState('');
  const request = useRef(0);

  useEffect(() => () => { request.current += 1; }, []);

  function handleFile(event) {
    const id = ++request.current;
    const file = event.target.files?.[0];
    setHeader(null);
    setError('');
    setFilename(file?.name ?? '');
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = () => {
        if (id !== request.current) return;
        try {
          setHeader(parseGenesisRom(reader.result));
        } catch (err) {
          setError(err.message);
        }
      };
      reader.onerror = () => {
        if (id === request.current) setError('Could not read the selected file.');
      };
      reader.onabort = reader.onerror;
      reader.readAsArrayBuffer(file);
    } catch {
      if (id === request.current) setError('Could not read the selected file.');
    }
  }

  const fields = header && [
    ['System type', header.system], ['Copyright / release', header.copyright],
    ['Domestic title', header.domesticTitle], ['Overseas title', header.overseasTitle],
    ['Serial number', header.serial], ['Header checksum', hex(header.checksum, 4)],
    ['Calculated checksum', hex(header.calculatedChecksum, 4)],
    ['Device support', header.devices], ['ROM start', hex(header.romStart, 8)],
    ['ROM end', hex(header.romEnd, 8)], ['RAM start', hex(header.ramStart, 8)],
    ['RAM end', hex(header.ramEnd, 8)], ['Region codes', header.region],
  ];

  return (
    <section className="genesis-inspector" aria-label="Genesis ROM header inspector">
      <p>Select a ROM file to inspect its header and checksum locally in your browser.</p>
      <label htmlFor="genesis-rom-file">ROM file</label>
      <input id="genesis-rom-file" type="file" onChange={handleFile} />
      {filename && <p>Selected: {filename}</p>}
      {error && <p role="alert" className="genesis-error">{error}</p>}
      {header && (
        <>
          <p className={header.checksum === header.calculatedChecksum
            ? 'genesis-match' : 'genesis-mismatch'}>
            Checksum: {header.checksum === header.calculatedChecksum ? 'Match' : 'Mismatch'}
          </p>
          <dl className="genesis-fields">
            {fields.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
