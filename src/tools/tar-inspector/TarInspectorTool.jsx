import { useMemo, useRef, useState } from 'react';
import {
  createMockTarArchive,
  formatFileSize,
  getEntryIcon,
  parseTarArchive,
  TYPE_FLAGS,
} from './tar-inspector.utils.js';
import './tar-inspector.css';

/**
 * Creates a standard sample TAR archive with regular files, directories,
 * symlinks, and a GNU long-name entry.
 * @returns {Uint8Array}
 */
function createValidDemoArchive() {
  const longName = 'deep/nested/directory/structure/containing/a/very/long/' +
    'path/name/that/exceeds/one/hundred/characters/config.json';

  return createMockTarArchive([
    {
      name: 'README.md',
      content: '# Project Toolkit\nInspecting TAR files client-side.\n',
      mode: 0o644,
      mtime: 1715000000,
    },
    {
      name: 'src/main.js',
      content: 'console.log("Welcome to TAR Inspector!");\n',
      mode: 0o755,
      mtime: 1715000100,
    },
    {
      name: 'docs/',
      typeflag: TYPE_FLAGS.DIRECTORY,
      mode: 0o755,
      mtime: 1715000200,
    },
    {
      name: 'docs/current.md',
      typeflag: TYPE_FLAGS.SYMLINK,
      linkname: 'README.md',
      mode: 0o777,
      mtime: 1715000300,
    },
    {
      name: longName,
      content: '{\n  "version": "1.0.0",\n  "archived": true\n}\n',
      useGnuLongName: true,
      mode: 0o644,
      mtime: 1715000400,
    },
  ]);
}

/**
 * Creates a sample corrupted TAR archive to test error states.
 * @returns {Uint8Array}
 */
function createCorruptedDemoArchive() {
  const valid = createValidDemoArchive();
  const corrupted = new Uint8Array(valid);
  // Corrupt block checksum byte
  corrupted[149] = 0x39;
  return corrupted;
}

/**
 * Renders the browser-local TAR Archive Inspector tool.
 * Parses POSIX ustar and GNU TAR header metadata without extraction.
 *
 * @returns {React.JSX.Element} The TAR Inspector UI.
 */
export default function TarInspectorTool() {
  const [archive, setArchive] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [error, setError] = useState('');
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  function handleArchiveBuffer(buffer, name, size) {
    try {
      const parsed = parseTarArchive(buffer);
      setArchive(parsed);
      setFileName(name);
      setFileSize(size);
      setSelectedEntry(parsed.entries[0] || null);
      setError('');
    } catch (err) {
      setArchive(null);
      setSelectedEntry(null);
      setError(err.message || 'Failed to parse TAR archive.');
    }
  }

  function handleFileSelected(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = new Uint8Array(event.target.result);
      handleArchiveBuffer(buffer, file.name, file.size);
    };
    reader.onerror = () => {
      setError('Failed to read the selected file from disk.');
    };
    reader.readAsArrayBuffer(file);
  }

  function handleFileInputChange(event) {
    const file = event.target.files?.[0];
    if (file) handleFileSelected(file);
  }

  function handleDragOver(event) {
    event.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFileSelected(file);
  }

  function handleLoadSample() {
    const demoBytes = createValidDemoArchive();
    handleArchiveBuffer(demoBytes, 'sample-archive.tar', demoBytes.length);
  }

  function handleLoadCorruptedSample() {
    const corruptedBytes = createCorruptedDemoArchive();
    handleArchiveBuffer(corruptedBytes, 'corrupted-archive.tar', corruptedBytes.length);
  }

  function handleClear() {
    setArchive(null);
    setFileName('');
    setFileSize(0);
    setError('');
    setSelectedEntry(null);
    setSearchQuery('');
    setTypeFilter('ALL');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const filteredEntries = useMemo(() => {
    if (!archive) return [];
    return archive.entries.filter((entry) => {
      const matchesSearch = searchQuery === '' ||
        entry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.type.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'ALL' ||
        entry.type.toUpperCase().includes(typeFilter);
      return matchesSearch && matchesType;
    });
  }, [archive, searchQuery, typeFilter]);

  return (
    <section className="tar-inspector-tool" aria-label="TAR Archive Inspector">
      {/* File Upload & Drag-Drop Zone */}
      {!archive && (
        <div
          className={`tar-dropzone ${isDragOver ? 'is-dragover' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              fileInputRef.current?.click();
            }
          }}
          aria-label="Upload TAR archive"
        >
          <span className="tar-dropzone-icon" aria-hidden="true">📦</span>
          <p className="tar-dropzone-title">Drop a TAR archive here, or click to browse</p>
          <p className="tar-dropzone-hint">
            Supports POSIX ustar, GNU tar, and PAX extended formats (client-side only)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            className="tar-file-input"
            onChange={handleFileInputChange}
            aria-label="Select TAR archive file"
          />
          <div className="tar-sample-bar" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleLoadSample}
            >
              Load Sample TAR
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleLoadCorruptedSample}
            >
              Load Corrupted Sample
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="tar-error-banner" role="alert">
          <div className="tar-error-content">
            <span aria-hidden="true">⚠</span>
            <span>{error}</span>
          </div>
          <button type="button" className="btn" onClick={handleClear}>
            Dismiss
          </button>
        </div>
      )}

      {/* Archive Summary Toolbar */}
      {archive && (
        <>
          <div className="tar-summary-bar">
            <div className="tar-summary-meta">
              <div className="tar-summary-item">
                <span className="tar-summary-label">Archive</span>
                <span className="tar-summary-value">{fileName}</span>
              </div>
              <div className="tar-summary-item">
                <span className="tar-summary-label">Archive Size</span>
                <span className="tar-summary-value">{formatFileSize(fileSize)}</span>
              </div>
              <div className="tar-summary-item">
                <span className="tar-summary-label">Format</span>
                <span className="tar-badge">{archive.format}</span>
              </div>
              <div className="tar-summary-item">
                <span className="tar-summary-label">Entries</span>
                <span className="tar-summary-value">{archive.entries.length}</span>
              </div>
              <div className="tar-summary-item">
                <span className="tar-summary-label">Total Uncompressed</span>
                <span className="tar-summary-value">{formatFileSize(archive.totalSize)}</span>
              </div>
            </div>

            <div className="tar-toolbar-actions">
              <button
                type="button"
                className="btn"
                onClick={() => fileInputRef.current?.click()}
              >
                Change File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="tar-file-input"
                onChange={handleFileInputChange}
                aria-label="Select another TAR archive file"
              />
              <button type="button" className="btn" onClick={handleClear}>
                Clear
              </button>
            </div>
          </div>

          {/* Filtering and Search Controls */}
          <div className="tar-controls-bar">
            <div className="tar-search-box">
              <input
                type="search"
                className="tar-search-input"
                placeholder="Filter entries by path or type…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Filter archive entries"
              />
            </div>
            <select
              className="tar-filter-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter by entry type"
            >
              <option value="ALL">All Types ({archive.entries.length})</option>
              <option value="FILE">Regular Files</option>
              <option value="DIRECTORY">Directories</option>
              <option value="LINK">Links (Symlink / Hardlink)</option>
              <option value="GNU">GNU Extensions</option>
            </select>
          </div>

          {/* Entries Table & Detail Grid */}
          <div className={`tar-content-grid ${selectedEntry ? 'has-selection' : ''}`}>
            <div className="tar-table-wrapper">
              <table className="tar-table" aria-label="Archive entries">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Mode</th>
                    <th>Modified (UTC)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry) => {
                    const isSelected = selectedEntry?.id === entry.id;
                    return (
                      <tr
                        key={entry.id}
                        className={`tar-table-row ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setSelectedEntry(entry)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setSelectedEntry(entry);
                          }
                        }}
                        aria-selected={isSelected}
                      >
                        <td>
                          <span
                            className="tar-badge"
                            title={`Typeflag: ${entry.typeflag || '0'}`}
                          >
                            <span aria-hidden="true">{getEntryIcon(entry.typeflag)}</span>
                            {entry.type}
                          </span>
                        </td>
                        <td className="tar-entry-name">
                          <span>{entry.name}</span>
                          {entry.linkname && (
                            <span className="tar-detail-label">
                              {' '}→ {entry.linkname}
                            </span>
                          )}
                        </td>
                        <td>{formatFileSize(entry.size)}</td>
                        <td className="tar-entry-mode">{entry.permissions}</td>
                        <td>{entry.mtimeFormatted}</td>
                      </tr>
                    );
                  })}
                  {filteredEntries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="tar-empty-notice">
                        No entries match your search criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Per-Entry Detail Panel */}
            {selectedEntry && (
              <div
                className="tar-details-panel"
                aria-labelledby="entry-details-title"
              >
                <div className="tar-details-header">
                  <h3 id="entry-details-title" className="tar-details-title">
                    <span aria-hidden="true">{getEntryIcon(selectedEntry.typeflag)} </span>
                    {selectedEntry.name}
                  </h3>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setSelectedEntry(null)}
                    aria-label="Close entry details"
                  >
                    ✕
                  </button>
                </div>

                <div className="tar-details-grid">
                  <div className="tar-detail-field">
                    <span className="tar-detail-label">Entry Type</span>
                    <span className="tar-detail-value">
                      {selectedEntry.type} (flag: &apos;{selectedEntry.typeflag}&apos;)
                    </span>
                  </div>

                  <div className="tar-detail-field">
                    <span className="tar-detail-label">Size</span>
                    <span className="tar-detail-value">
                      {formatFileSize(selectedEntry.size)} ({selectedEntry.size} bytes)
                    </span>
                  </div>

                  <div className="tar-detail-field">
                    <span className="tar-detail-label">Permissions</span>
                    <span className="tar-detail-value">
                      {selectedEntry.permissions} (0{selectedEntry.modeOctal})
                    </span>
                  </div>

                  <div className="tar-detail-field">
                    <span className="tar-detail-label">Owner / Group</span>
                    <span className="tar-detail-value">
                      {selectedEntry.uname || selectedEntry.uid} /{' '}
                      {selectedEntry.gname || selectedEntry.gid}
                    </span>
                  </div>

                  <div className="tar-detail-field">
                    <span className="tar-detail-label">Modified (UTC)</span>
                    <span className="tar-detail-value">
                      {selectedEntry.mtimeFormatted}
                    </span>
                  </div>

                  <div className="tar-detail-field">
                    <span className="tar-detail-label">Checksum</span>
                    <span className="tar-detail-value">
                      0o{selectedEntry.checksum.toString(8)}{' '}
                      <span className="tar-badge badge-success">✓ Valid</span>
                    </span>
                  </div>

                  <div className="tar-detail-field">
                    <span className="tar-detail-label">Format / Magic</span>
                    <span className="tar-detail-value">
                      {selectedEntry.format} ({selectedEntry.magic || 'legacy'})
                    </span>
                  </div>

                  <div className="tar-detail-field">
                    <span className="tar-detail-label">Header Offset</span>
                    <span className="tar-detail-value">
                      {selectedEntry.offset} bytes
                    </span>
                  </div>

                  {selectedEntry.linkname && (
                    <div className="tar-detail-field">
                      <span className="tar-detail-label">Link Target</span>
                      <span className="tar-detail-value">
                        {selectedEntry.linkname}
                      </span>
                    </div>
                  )}

                  {selectedEntry.prefix && (
                    <div className="tar-detail-field">
                      <span className="tar-detail-label">Filename Prefix</span>
                      <span className="tar-detail-value">
                        {selectedEntry.prefix}
                      </span>
                    </div>
                  )}

                  {selectedEntry.targetName && (
                    <div className="tar-detail-field">
                      <span className="tar-detail-label">Target Name</span>
                      <span className="tar-detail-value">
                        {selectedEntry.targetName}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
