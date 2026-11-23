import { useEffect, useRef, useState } from 'react';
import { parseSuperblock, SUPERBLOCK_OFFSET, SUPERBLOCK_SIZE } from './f2fs.utils.js';
import './f2fs.css';

const labels = {
  version: 'Version',
  logSectorSize: 'Log₂ sector size (bytes)',
  logSectorsPerBlock: 'Log₂ sectors per block',
  logBlockSize: 'Log₂ block size (bytes)',
  logBlocksPerSegment: 'Log₂ blocks per segment',
  blocksPerSegment: 'Blocks per segment',
  blockCount: 'Total block count',
  sectionCount: 'Section count',
  segmentCount: 'Total segment count',
  checkpointSegments: 'Checkpoint segments',
  sitSegments: 'SIT segments',
  natSegments: 'NAT segments',
  ssaSegments: 'SSA segments',
  mainSegments: 'Main area segments',
  uuid: 'UUID',
  volumeName: 'Volume name',
  features: 'Feature flags (bitmask)',
};

/** Render an inspector for the primary F2FS superblock. */
export default function F2fsSuperblockTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);

  function handleFile(event) {
    const id = ++request.current;
    const file = event.target.files?.[0];
    setResult(null);
    setError('');
    if (!file) return;
    if (file.size < SUPERBLOCK_OFFSET + SUPERBLOCK_SIZE) {
      setError('File is too short to contain an F2FS superblock.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (request.current !== id) return;
      try {
        setResult(parseSuperblock(reader.result));
      } catch (err) {
        setError(err.message);
      }
    };
    reader.onerror = () => {
      if (request.current === id) setError('Unable to read the selected file.');
    };
    reader.readAsArrayBuffer(file.slice(SUPERBLOCK_OFFSET, SUPERBLOCK_OFFSET + SUPERBLOCK_SIZE));
  }

  return (
    <section className="f2fs-tool" aria-label="F2FS Superblock Inspector">
      <p>Select an F2FS image to inspect its primary superblock. The file stays on your device.</p>
      <label htmlFor="f2fs-file">Filesystem image</label>
      <input id="f2fs-file" type="file" onChange={handleFile} />
      {error && <div className="f2fs-error" role="alert">{error}</div>}
      {result && (
        <dl className="f2fs-results">
          {Object.entries(result).map(([key, value]) => (
            <div key={key}>
              <dt>{labels[key]}</dt><dd>{value === '' ? '(empty)' : value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
