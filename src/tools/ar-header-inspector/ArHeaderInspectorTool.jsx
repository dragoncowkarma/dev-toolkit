import { useRef, useState } from 'react';
import { formatArMode, formatArTimestamp, parseArArchive } from './ar-header-inspector.utils.js';
import './ar-header-inspector.css';

/**
 * Renders a client-side Unix ar archive header inspector.
 *
 * @returns {React.JSX.Element} The archive inspector UI.
 */
export default function ArHeaderInspectorTool() {
  const [fileName, setFileName] = useState('');
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    try {
      const archive = parseArArchive(await file.arrayBuffer());
      setFileName(file.name);
      setMembers(archive.members);
      setError('');
    } catch (parseError) {
      setFileName(file.name);
      setMembers([]);
      setError(parseError instanceof Error ? parseError.message : 'Unable to parse archive.');
    }
  }

  function handleFileChange(event) {
    inspectFile(event.target.files?.[0]);
    event.target.value = '';
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    inspectFile(event.dataTransfer.files?.[0]);
  }

  return (
    <section className="ar-header-inspector" aria-label="AR Archive Header Inspector">
      <input
        ref={fileInputRef}
        className="ar-header-inspector__input"
        type="file"
        accept=".a,.ar,.deb,application/x-archive"
        aria-label="Choose an ar archive"
        onChange={handleFileChange}
      />
      <div
        className={`ar-header-inspector__dropzone ${isDragging ? 'is-dragging' : ''}`}
        onDragEnter={() => setIsDragging(true)}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <p>Drop an ar archive here, or choose a file to inspect locally.</p>
        <button
          type="button"
          className="ar-header-inspector__button"
          onClick={() => fileInputRef.current?.click()}
        >
          Choose archive
        </button>
        <small>Supports GNU and BSD ar archives, including .a and .deb files.</small>
      </div>

      {error && (
        <div className="ar-header-inspector__error" role="alert">
          Unable to parse {fileName || 'archive'}: {error}
        </div>
      )}

      {!error && fileName && (
        <div className="ar-header-inspector__results">
          <h3>{fileName}</h3>
          <p>{members.length} member{members.length === 1 ? '' : 's'} found</p>
          <div className="ar-header-inspector__table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Size</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member, index) => (
                  <tr key={`${member.name}-${index}`}>
                    <td>{member.name}</td>
                    <td>{member.size.toLocaleString()} B</td>
                    <td>{formatArMode(member.mode)}</td>
                    <td>{formatArTimestamp(member.mtime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
