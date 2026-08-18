import { useState, useMemo, useRef, useEffect } from 'react';
import {
  parseHar,
  filterAndSortEntries,
  formatDuration,
  SAMPLE_HAR,
} from './har.utils.js';
import './har.css';

/**
 * HAR Viewer component for parsing, filtering, and inspecting browser DevTools
 * HTTP Archive (.har) capture files.
 * @returns {JSX.Element} HAR Viewer interface.
 */
export default function HarTool() {
  const [inputRaw, setInputRaw] = useState('');
  // Parse result is kept next to the raw source so a single parse per source
  // transition can both drive rendering and decide whether filters must reset.
  const [parseResult, setParseResult] = useState(() => parseHar(''));
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [mimeFilter, setMimeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('index');
  const [sortOrder, setSortOrder] = useState('asc');
  const [toastMessage, setToastMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const { success, error, entries, summary, warnings } = parseResult;

  // Derive distinct HTTP methods present in entries
  const availableMethods = useMemo(() => {
    if (!entries || entries.length === 0) return [];
    const methods = new Set(entries.map((e) => e.method).filter(Boolean));
    return Array.from(methods).sort();
  }, [entries]);

  // Filter and sort entries
  const filteredEntries = useMemo(() => {
    if (!success || !entries) return [];
    return filterAndSortEntries(entries, {
      search: searchQuery,
      statusFilter,
      methodFilter,
      mimeFilter,
      sortBy,
      sortOrder,
    });
  }, [success, entries, searchQuery, statusFilter, methodFilter, mimeFilter, sortBy, sortOrder]);

  // Selected entry detail
  const selectedEntry = useMemo(() => {
    if (!selectedEntryId || !entries) return null;
    return entries.find((e) => e.id === selectedEntryId) || null;
  }, [selectedEntryId, entries]);

  const hasParamsOrBody = Boolean(
    selectedEntry &&
      (selectedEntry.request.queryString.length > 0 || selectedEntry.request.postData)
  );

  // Reconcile tab selection if current tab is unavailable on selected entry
  const safeActiveTab = useMemo(() => {
    if (activeTab === 'params' && !hasParamsOrBody) {
      return 'overview';
    }
    return activeTab;
  }, [activeTab, hasParamsOrBody]);

  const showToast = (msg) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage('');
      toastTimeoutRef.current = null;
    }, 2000);
  };

  const handleCopy = async (text, label) => {
    if (!text) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showToast(`Copied ${label} to clipboard!`);
      } else {
        showToast('Clipboard access not available.');
      }
    } catch {
      showToast('Failed to copy to clipboard.');
    }
  };

  // Reset the transient per-archive filters. Sorting is intentionally excluded:
  // it stays applicable to any archive, so it is not stale after a new load.
  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setMethodFilter('all');
    setMimeFilter('all');
  };

  /**
   * Apply new HAR source text and perform the shared input transition.
   * Filters are dropped only once the incoming text parses into a valid
   * archive, so a transient editing typo never discards the current view.
   * @param {string} text Raw HAR JSON source text.
   * @param {number|null} [nextSelectedEntryId] Entry id to select after loading.
   * @returns {void}
   */
  const applyHarSource = (text, nextSelectedEntryId = null) => {
    const result = parseHar(text);
    setInputRaw(text);
    setParseResult(result);
    setSelectedEntryId(nextSelectedEntryId);
    setActiveTab('overview');
    if (result.success) {
      resetFilters();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    readFile(file);
  };

  const readFile = (file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      applyHarSource(event.target.result);
    };
    reader.onerror = () => {
      showToast('Failed to read HAR file.');
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      readFile(e.dataTransfer.files[0]);
    }
  };

  const handleLoadSample = () => {
    applyHarSource(JSON.stringify(SAMPLE_HAR, null, 2), 1);
    setSortBy('index');
    setSortOrder('asc');
  };

  const handleClear = () => {
    // Empty input never parses, so the cleared view resets filters explicitly.
    applyHarSource('');
    resetFilters();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSelectEntry = (id) => {
    setSelectedEntryId((prev) => (prev === id ? null : id));
    setActiveTab('overview');
  };

  const handleSortChange = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const renderSortHeader = (field, label, widthClass = '') => {
    const isCurrent = sortBy === field;
    const sortDir = isCurrent ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none';
    const indicator = isCurrent ? (sortOrder === 'asc' ? '▲' : '▼') : '';

    return (
      <th
        scope="col"
        className={`har-sortable-th ${widthClass}`}
        aria-sort={sortDir}
        tabIndex={0}
        onClick={() => handleSortChange(field)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSortChange(field);
          }
        }}
        role="columnheader"
        aria-label={`Sort by ${label}${isCurrent ? ` (${sortOrder})` : ''}`}
      >
        <span className="har-th-content">
          {label} {indicator && <span className="har-sort-indicator">{indicator}</span>}
        </span>
      </th>
    );
  };

  return (
    <div className="har-container">
      {/* Toast Feedback */}
      <div className="sr-only" aria-live="polite">
        {toastMessage}
      </div>

      {/* Action Header */}
      <div className="har-header-actions">
        <div className="har-btn-group">
          <button
            type="button"
            className="har-btn har-btn-primary"
            onClick={handleLoadSample}
            aria-label="Load sample HAR archive file"
          >
            📂 Load sample
          </button>
          <button
            type="button"
            className="har-btn"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            aria-label="Upload HAR file from computer"
          >
            ⬆️ Upload HAR file
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="har-file-input"
            accept=".har,.json,application/json"
            onChange={handleFileChange}
            aria-label="Choose HAR file"
          />
          {inputRaw && (
            <button
              type="button"
              className="har-btn har-btn-danger"
              onClick={handleClear}
              aria-label="Clear HAR data and reset view"
            >
              🗑️ Clear
            </button>
          )}
        </div>
        {toastMessage && <span className="har-toast">{toastMessage}</span>}
      </div>

      {/* Input Dropzone & Textarea */}
      <div className="har-input-section">
        {!inputRaw ? (
          <div
            className={`har-dropzone ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current && fileInputRef.current.click();
              }
            }}
            aria-label="Drag and drop a HAR file here or click to browse"
          >
            <div className="har-dropzone-icon">🌐</div>
            <p>
              <strong>Drag &amp; drop a browser DevTools .har file here</strong> or click to upload
            </p>
            <span className="har-dropzone-subtitle">
              Entirely client-side — no network calls or server uploads.
            </span>
          </div>
        ) : (
          <textarea
            className="har-textarea"
            value={inputRaw}
            onChange={(e) => applyHarSource(e.target.value)}
            placeholder="Paste .har JSON content here..."
            aria-label="Raw HAR JSON input"
          />
        )}
      </div>

      {/* Top Level Error Alert */}
      {error && inputRaw.trim() && (
        <div className="har-alert har-alert-error" role="alert">
          <strong>⚠️ HAR Parse Error:</strong> {error}
        </div>
      )}

      {/* Entry Warnings Alert */}
      {success && warnings.length > 0 && (
        <div className="har-alert har-alert-warning" role="alert">
          <strong>
            ⚠️ Diagnostics ({warnings.length} warning{warnings.length > 1 ? 's' : ''}):
          </strong>
          <ul className="har-warning-list">
            {warnings.slice(0, 5).map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
            {warnings.length > 5 && <li>...and {warnings.length - 5} more warning(s).</li>}
          </ul>
        </div>
      )}

      {/* Aggregate Metrics Bar */}
      {success && summary && (
        <div className="har-summary-grid">
          <div className="har-stat-card">
            <span className="har-stat-label">Total Requests</span>
            <span className="har-stat-value">{summary.totalRequests}</span>
          </div>
          <div className="har-stat-card">
            <span className="har-stat-label">Transferred</span>
            <span className="har-stat-value">{summary.totalTransferredFormatted}</span>
          </div>
          <div className="har-stat-card">
            <span className="har-stat-label">Wall-Clock Duration</span>
            <span className="har-stat-value">{summary.totalWallClockFormatted}</span>
          </div>
          <div className="har-stat-card har-stat-card-span2">
            <span className="har-stat-label">Status Breakdown</span>
            <div className="har-status-breakdown">
              {summary.statusCounts['1xx'] > 0 && (
                <span className="har-badge har-badge-1xx">
                  1xx: {summary.statusCounts['1xx']}
                </span>
              )}
              <span className="har-badge har-badge-2xx">2xx: {summary.statusCounts['2xx']}</span>
              <span className="har-badge har-badge-3xx">3xx: {summary.statusCounts['3xx']}</span>
              <span className="har-badge har-badge-4xx">4xx: {summary.statusCounts['4xx']}</span>
              <span className="har-badge har-badge-5xx">5xx: {summary.statusCounts['5xx']}</span>
              {summary.statusCounts.other > 0 && (
                <span className="har-badge har-badge-other">
                  Other: {summary.statusCounts.other}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar Filters */}
      {success && entries.length > 0 && (
        <div className="har-toolbar">
          <input
            type="text"
            className="har-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search URL, method, status..."
            aria-label="Filter network requests by text query"
          />

          <select
            className="har-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status code class"
          >
            <option value="all">All Statuses</option>
            <option value="1xx">1xx Informational</option>
            <option value="2xx">2xx Success</option>
            <option value="3xx">3xx Redirect</option>
            <option value="4xx">4xx Client Error</option>
            <option value="5xx">5xx Server Error</option>
            <option value="errors">All Errors (4xx/5xx/0)</option>
          </select>

          <select
            className="har-select"
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            aria-label="Filter by HTTP method"
          >
            <option value="all">All Methods</option>
            {availableMethods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            className="har-select"
            value={mimeFilter}
            onChange={(e) => setMimeFilter(e.target.value)}
            aria-label="Filter by MIME type category"
          >
            <option value="all">All Types</option>
            <option value="xhr">Fetch / XHR (JSON/XML)</option>
            <option value="script">JS Scripts</option>
            <option value="stylesheet">CSS Stylesheets</option>
            <option value="image">Images / SVG</option>
            <option value="font">Fonts</option>
            <option value="document">HTML Documents</option>
            <option value="other">Other</option>
          </select>

          <select
            className="har-select"
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split('-');
              setSortBy(field);
              setSortOrder(order);
            }}
            aria-label="Sort entries by column"
          >
            <option value="index-asc">Order (1 -&gt; N)</option>
            <option value="index-desc">Order (N -&gt; 1)</option>
            <option value="method-asc">Method (A-Z)</option>
            <option value="method-desc">Method (Z-A)</option>
            <option value="url-asc">URL (A-Z)</option>
            <option value="url-desc">URL (Z-A)</option>
            <option value="status-asc">Status Code (Low-High)</option>
            <option value="status-desc">Status Code (High-Low)</option>
            <option value="mimeType-asc">Type (A-Z)</option>
            <option value="mimeType-desc">Type (Z-A)</option>
            <option value="transferredSize-desc">Size (Largest First)</option>
            <option value="transferredSize-asc">Size (Smallest First)</option>
            <option value="time-desc">Duration (Slowest First)</option>
            <option value="time-asc">Duration (Fastest First)</option>
          </select>
        </div>
      )}

      {/* Main Request/Response Table */}
      {success && entries.length > 0 && (
        <div className="har-table-wrapper">
          <table className="har-table" aria-label="HAR network entries table">
            <thead>
              <tr>
                {renderSortHeader('index', '#', 'har-th-num')}
                {renderSortHeader('method', 'Method', 'har-th-method')}
                {renderSortHeader('url', 'URL / Resource')}
                {renderSortHeader('status', 'Status', 'har-th-status')}
                {renderSortHeader('mimeType', 'Type', 'har-th-type')}
                {renderSortHeader('transferredSize', 'Size', 'har-th-size')}
                {renderSortHeader('time', 'Time', 'har-th-time')}
                <th scope="col" className="har-th-timeline">
                  Timeline
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="har-td-empty">
                    <span className="har-empty-msg">
                      No network entries match the selected filters.
                    </span>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => {
                  const isSelected = selectedEntryId === entry.id;
                  const statusBadgeClass = `har-badge-${entry.statusClass}`;
                  const methodClass = `har-method-${entry.method || 'GET'}`;

                  // Calculate mini timeline segment widths
                  const totalTime = entry.time || 1;
                  const getSegPct = (val) =>
                    Math.max(0, Math.min(100, ((val || 0) / totalTime) * 100));

                  return (
                    <tr
                      key={entry.id}
                      className={isSelected ? 'har-row-selected' : ''}
                      onClick={() => handleSelectEntry(entry.id)}
                    >
                      <td>
                        <button
                          type="button"
                          className="har-row-select-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectEntry(entry.id);
                          }}
                          aria-label={`Select entry #${entry.id}: ${entry.method} ${entry.url}`}
                        >
                          {entry.id}
                        </button>
                      </td>
                      <td>
                        <span className={`har-method-tag ${methodClass}`}>{entry.method}</span>
                      </td>
                      <td className="har-url-cell">
                        <div className="har-url-path" title={entry.url}>
                          {entry.pathname || entry.url}
                        </div>
                        {entry.host && <div className="har-url-host">{entry.host}</div>}
                      </td>
                      <td>
                        <span className={`har-badge ${statusBadgeClass}`}>
                          {entry.status || 'N/A'}
                        </span>
                      </td>
                      <td>
                        <span className="har-mime-tag" title={entry.mimeType}>
                          {entry.mimeCategory.toUpperCase()}
                        </span>
                      </td>
                      <td>{entry.transferredFormatted}</td>
                      <td>{entry.timeFormatted}</td>
                      <td>
                        <div
                          className="har-mini-timing-bar"
                          title={`Total: ${entry.timeFormatted}`}
                        >
                          <div
                            className="har-timing-seg seg-blocked"
                            style={{ width: `${getSegPct(entry.timings.blocked)}%` }}
                          />
                          <div
                            className="har-timing-seg seg-dns"
                            style={{ width: `${getSegPct(entry.timings.dns)}%` }}
                          />
                          <div
                            className="har-timing-seg seg-connect"
                            style={{ width: `${getSegPct(entry.timings.connect)}%` }}
                          />
                          <div
                            className="har-timing-seg seg-ssl"
                            style={{ width: `${getSegPct(entry.timings.ssl)}%` }}
                          />
                          <div
                            className="har-timing-seg seg-send"
                            style={{ width: `${getSegPct(entry.timings.send)}%` }}
                          />
                          <div
                            className="har-timing-seg seg-wait"
                            style={{ width: `${getSegPct(entry.timings.wait)}%` }}
                          />
                          <div
                            className="har-timing-seg seg-receive"
                            style={{ width: `${getSegPct(entry.timings.receive)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Entry Detail Panel */}
      {selectedEntry && (
        <section className="har-detail-panel" aria-label="Selected request details">
          <div className="har-detail-header">
            <div className="har-detail-title-group">
              <span className={`har-method-tag har-method-${selectedEntry.method}`}>
                {selectedEntry.method}
              </span>
              <span className={`har-badge har-badge-${selectedEntry.statusClass}`}>
                {selectedEntry.status} {selectedEntry.response.statusText}
              </span>
              <span className="har-detail-url">{selectedEntry.url}</span>
            </div>
            <div className="har-btn-group">
              <button
                type="button"
                className="har-btn"
                onClick={() => handleCopy(selectedEntry.url, 'URL')}
                aria-label="Copy request URL"
              >
                📋 Copy URL
              </button>
              <button
                type="button"
                className="har-btn"
                onClick={() => setSelectedEntryId(null)}
                aria-label="Close request details panel"
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="har-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              id="har-tab-overview"
              aria-controls="har-tabpanel-overview"
              aria-selected={safeActiveTab === 'overview'}
              className={`har-tab ${safeActiveTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              ⏱️ Timing &amp; Overview
            </button>
            <button
              type="button"
              role="tab"
              id="har-tab-req-headers"
              aria-controls="har-tabpanel-req-headers"
              aria-selected={safeActiveTab === 'req-headers'}
              className={`har-tab ${safeActiveTab === 'req-headers' ? 'active' : ''}`}
              onClick={() => setActiveTab('req-headers')}
            >
              Request Headers ({selectedEntry.request.headers.length})
            </button>
            <button
              type="button"
              role="tab"
              id="har-tab-res-headers"
              aria-controls="har-tabpanel-res-headers"
              aria-selected={safeActiveTab === 'res-headers'}
              className={`har-tab ${safeActiveTab === 'res-headers' ? 'active' : ''}`}
              onClick={() => setActiveTab('res-headers')}
            >
              Response Headers ({selectedEntry.response.headers.length})
            </button>
            <button
              type="button"
              role="tab"
              id="har-tab-cookies"
              aria-controls="har-tabpanel-cookies"
              aria-selected={safeActiveTab === 'cookies'}
              className={`har-tab ${safeActiveTab === 'cookies' ? 'active' : ''}`}
              onClick={() => setActiveTab('cookies')}
            >
              Cookies (
              {selectedEntry.request.cookies.length + selectedEntry.response.cookies.length})
            </button>
            {hasParamsOrBody && (
              <button
                type="button"
                role="tab"
                id="har-tab-params"
                aria-controls="har-tabpanel-params"
                aria-selected={safeActiveTab === 'params'}
                className={`har-tab ${safeActiveTab === 'params' ? 'active' : ''}`}
                onClick={() => setActiveTab('params')}
              >
                Params &amp; Body
              </button>
            )}
          </div>

          {/* Tab 1: Timing & Overview */}
          {safeActiveTab === 'overview' && (
            <div
              className="har-tab-content"
              role="tabpanel"
              id="har-tabpanel-overview"
              aria-labelledby="har-tab-overview"
            >
              <div className="har-timing-legend">
                <div className="har-legend-item">
                  <span className="har-legend-dot seg-blocked" /> Blocked (
                  {formatDuration(selectedEntry.timings.blocked)})
                </div>
                <div className="har-legend-item">
                  <span className="har-legend-dot seg-dns" /> DNS (
                  {formatDuration(selectedEntry.timings.dns)})
                </div>
                <div className="har-legend-item">
                  <span className="har-legend-dot seg-connect" /> Connect (
                  {formatDuration(selectedEntry.timings.connect)})
                </div>
                <div className="har-legend-item">
                  <span className="har-legend-dot seg-ssl" /> SSL/TLS (
                  {formatDuration(selectedEntry.timings.ssl)})
                </div>
                <div className="har-legend-item">
                  <span className="har-legend-dot seg-send" /> Send (
                  {formatDuration(selectedEntry.timings.send)})
                </div>
                <div className="har-legend-item">
                  <span className="har-legend-dot seg-wait" /> Wait / TTFB (
                  {formatDuration(selectedEntry.timings.wait)})
                </div>
                <div className="har-legend-item">
                  <span className="har-legend-dot seg-receive" /> Receive (
                  {formatDuration(selectedEntry.timings.receive)})
                </div>
              </div>

              <div className="har-timing-grid">
                <div className="har-timing-card">
                  <span className="har-timing-card-label">Start Time</span>
                  <span className="har-timing-card-val">
                    {selectedEntry.isValidDate
                      ? selectedEntry.parsedDate.toLocaleTimeString()
                      : 'N/A'}
                  </span>
                </div>
                <div className="har-timing-card">
                  <span className="har-timing-card-label">Total Duration</span>
                  <span className="har-timing-card-val">{selectedEntry.timeFormatted}</span>
                </div>
                <div className="har-timing-card">
                  <span className="har-timing-card-label">Transferred Size</span>
                  <span className="har-timing-card-val">
                    {selectedEntry.transferredFormatted}
                  </span>
                </div>
                <div className="har-timing-card">
                  <span className="har-timing-card-label">HTTP Version</span>
                  <span className="har-timing-card-val">{selectedEntry.request.httpVersion}</span>
                </div>
                {selectedEntry.serverIPAddress && (
                  <div className="har-timing-card">
                    <span className="har-timing-card-label">Server IP</span>
                    <span className="har-timing-card-val">{selectedEntry.serverIPAddress}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Request Headers */}
          {safeActiveTab === 'req-headers' && (
            <div
              className="har-tab-content"
              role="tabpanel"
              id="har-tabpanel-req-headers"
              aria-labelledby="har-tab-req-headers"
            >
              <div className="har-tab-actions">
                <span className="har-tab-title">Request Headers</span>
                <button
                  type="button"
                  className="har-btn"
                  onClick={() =>
                    handleCopy(
                      selectedEntry.request.headers
                        .map((h) => `${h.name}: ${h.value}`)
                        .join('\n'),
                      'Request Headers'
                    )
                  }
                  aria-label="Copy all request headers"
                >
                  📋 Copy All
                </button>
              </div>
              {selectedEntry.request.headers.length === 0 ? (
                <p className="har-empty-msg">No request headers captured.</p>
              ) : (
                <div className="har-kv-table-wrapper">
                  <table className="har-kv-table">
                    <thead>
                      <tr>
                        <th>Header Name</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEntry.request.headers.map((h, i) => (
                        <tr key={i}>
                          <td className="har-kv-key">{h.name}</td>
                          <td className="har-kv-val">{h.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Response Headers */}
          {safeActiveTab === 'res-headers' && (
            <div
              className="har-tab-content"
              role="tabpanel"
              id="har-tabpanel-res-headers"
              aria-labelledby="har-tab-res-headers"
            >
              <div className="har-tab-actions">
                <span className="har-tab-title">Response Headers</span>
                <button
                  type="button"
                  className="har-btn"
                  onClick={() =>
                    handleCopy(
                      selectedEntry.response.headers
                        .map((h) => `${h.name}: ${h.value}`)
                        .join('\n'),
                      'Response Headers'
                    )
                  }
                  aria-label="Copy all response headers"
                >
                  📋 Copy All
                </button>
              </div>
              {selectedEntry.response.headers.length === 0 ? (
                <p className="har-empty-msg">No response headers captured.</p>
              ) : (
                <div className="har-kv-table-wrapper">
                  <table className="har-kv-table">
                    <thead>
                      <tr>
                        <th>Header Name</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEntry.response.headers.map((h, i) => (
                        <tr key={i}>
                          <td className="har-kv-key">{h.name}</td>
                          <td className="har-kv-val">{h.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Cookies */}
          {safeActiveTab === 'cookies' && (
            <div
              className="har-tab-content"
              role="tabpanel"
              id="har-tabpanel-cookies"
              aria-labelledby="har-tab-cookies"
            >
              <h4 className="har-section-title">Request Cookies</h4>
              {selectedEntry.request.cookies.length === 0 ? (
                <p className="har-empty-msg">No request cookies present.</p>
              ) : (
                <div className="har-kv-table-wrapper har-kv-wrapper-mb">
                  <table className="har-kv-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Value</th>
                        <th>Domain</th>
                        <th>Path</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEntry.request.cookies.map((c, i) => (
                        <tr key={i}>
                          <td className="har-kv-key">{c.name}</td>
                          <td className="har-kv-val">{c.value}</td>
                          <td>{c.domain || 'N/A'}</td>
                          <td>{c.path || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h4 className="har-section-title">Response Cookies (Set-Cookie)</h4>
              {selectedEntry.response.cookies.length === 0 ? (
                <p className="har-empty-msg">No response cookies set.</p>
              ) : (
                <div className="har-kv-table-wrapper">
                  <table className="har-kv-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Value</th>
                        <th>Domain</th>
                        <th>Path</th>
                        <th>Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEntry.response.cookies.map((c, i) => (
                        <tr key={i}>
                          <td className="har-kv-key">{c.name}</td>
                          <td className="har-kv-val">{c.value}</td>
                          <td>{c.domain || 'N/A'}</td>
                          <td>{c.path || 'N/A'}</td>
                          <td>
                            {c.httpOnly && (
                              <span className="har-badge har-badge-other har-badge-mr">
                                HttpOnly
                              </span>
                            )}
                            {c.secure && <span className="har-badge har-badge-2xx">Secure</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 5: Params & Body */}
          {safeActiveTab === 'params' && (
            <div
              className="har-tab-content"
              role="tabpanel"
              id="har-tabpanel-params"
              aria-labelledby="har-tab-params"
            >
              {selectedEntry.request.queryString.length > 0 && (
                <>
                  <h4 className="har-section-title">Query Parameters</h4>
                  <div className="har-kv-table-wrapper har-kv-wrapper-mb">
                    <table className="har-kv-table">
                      <thead>
                        <tr>
                          <th>Parameter Name</th>
                          <th>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedEntry.request.queryString.map((q, i) => (
                          <tr key={i}>
                            <td className="har-kv-key">{q.name}</td>
                            <td className="har-kv-val">{q.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {selectedEntry.request.postData && (
                <>
                  <h4 className="har-section-title">
                    POST Data ({selectedEntry.request.postData.mimeType || 'unknown type'})
                  </h4>
                  <pre className="har-textarea har-postbody-pre">
                    {selectedEntry.request.postData.text || '(No body text captured)'}
                  </pre>
                </>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
