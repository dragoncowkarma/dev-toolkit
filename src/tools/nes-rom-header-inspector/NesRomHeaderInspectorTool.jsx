import { useRef, useState } from 'react';
import { formatRomSize, parseNesRomHeader } from './nesRom.utils.js';
import './nesRom.css';

function createSampleRom() {
  return new Uint8Array([0x4e, 0x45, 0x53, 0x1a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
}

function DetailCard({ title, children }) {
  return (
    <section className="nes-rom-card">
      <h3>{title}</h3>
      <dl>{children}</dl>
    </section>
  );
}

function Detail({ label, value }) {
  return (
    <div className="nes-rom-detail">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * Renders a client-side iNES and NES 2.0 ROM header inspector.
 *
 * @returns {React.JSX.Element} The ROM inspector UI.
 */
export default function NesRomHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  function inspectBytes(bytes, name) {
    try {
      setResult(parseNesRomHeader(bytes));
      setFileName(name);
      setError('');
    } catch (parseError) {
      setResult(null);
      setFileName('');
      setError(parseError.message);
    }
  }

  async function inspectFile(file) {
    if (!file) return;
    try {
      inspectBytes(await file.arrayBuffer(), file.name);
    } catch {
      setResult(null);
      setError('Unable to read the selected ROM file.');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    inspectFile(event.dataTransfer.files?.[0]);
  }

  return (
    <section className="nes-rom-tool" aria-label="NES ROM Header Inspector">
      <div
        className={`nes-rom-dropzone ${isDragging ? 'nes-rom-dropzone--active' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <p>Drop a .nes ROM here or choose a file.</p>
        <label className="nes-rom-button">
          Choose ROM
          <input
            ref={inputRef}
            type="file"
            accept=".nes,application/octet-stream"
            onChange={(event) => inspectFile(event.target.files?.[0])}
            aria-label="Choose NES ROM file"
          />
        </label>
        <button type="button" className="nes-rom-button nes-rom-button--secondary"
          onClick={() => inspectBytes(createSampleRom(), 'minimal-sample.nes')}
        >
          Load sample
        </button>
      </div>

      {error && <div className="nes-rom-error" role="alert">{error}</div>}

      {result && (
        <div className="nes-rom-results" aria-live="polite">
          <p className="nes-rom-file-name">{fileName}</p>
          <div className="nes-rom-grid">
            <DetailCard title="Overview">
              <Detail label="Format" value={result.format} />
              <Detail label="PRG-ROM" value={formatRomSize(result.prgRomSize)} />
              <Detail label="CHR-ROM" value={formatRomSize(result.chrRomSize)} />
              <Detail label="File size" value={formatRomSize(result.fileSize)} />
            </DetailCard>
            <DetailCard title="Mapper & mirroring">
              <Detail label="Mapper" value={result.mapperNumber} />
              <Detail label="Mirroring" value={result.mirroring} />
              <Detail label="Battery-backed RAM" value={result.hasBattery ? 'Yes' : 'No'} />
              <Detail label="Trainer" value={result.hasTrainer ? 'Present' : 'None'} />
              <Detail label="Four-screen VRAM" value={result.hasFourScreenVram ? 'Yes' : 'No'} />
            </DetailCard>
            <DetailCard title="Console type">
              <Detail label="System" value={result.consoleType} />
              <Detail label="CPU/PPU timing" value={result.cpuPpuTiming} />
              {result.vsSystem && (
                <>
                  <Detail label="Vs. hardware type" value={result.vsSystem.hardwareType} />
                  <Detail label="Vs. PPU type" value={result.vsSystem.ppuType} />
                </>
              )}
              {result.extendedConsoleType !== null && (
                <Detail label="Extended type" value={result.extendedConsoleType} />
              )}
            </DetailCard>
            {result.format === 'NES 2.0' && (
              <DetailCard title="NES 2.0 extended fields">
                <Detail label="Submapper" value={result.submapper} />
                <Detail label="PRG-RAM" value={formatRomSize(result.prgRamSize)} />
                <Detail label="PRG-NVRAM" value={formatRomSize(result.prgNvramSize)} />
                <Detail label="CHR-RAM" value={formatRomSize(result.chrRamSize)} />
                <Detail label="CHR-NVRAM" value={formatRomSize(result.chrNvramSize)} />
              </DetailCard>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
