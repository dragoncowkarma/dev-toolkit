import { useMemo, useRef, useState } from 'react';
import {
  filterEntries,
  formatBytes,
  formatDuration,
  getOverview,
  parseHar,
} from './har.utils.js';
import './har.css';

const TIMING_PHASES = [
  ['blocked', 'Blocked'], ['dns', 'DNS'], ['connect', 'Connect'], ['send', 'Send'],
  ['wait', 'Wait'], ['receive', 'Receive'],
];
const RESOURCE_TYPES = ['XHR/Fetch', 'JS', 'CSS', 'Img', 'Media', 'Doc', 'Other'];

function CodeBlock({ content, mimeType }) {
  const text = String(content ?? '');
  let formatted = text;
  let isJson = /json/i.test(mimeType ?? '');
  if (isJson) {
    try {
      formatted = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      isJson = false;
    }
  }

  if (!isJson) return <pre className="har-code">{formatted || 'No content recorded.'}</pre>;
  const tokenPattern = /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  const tokens = [];
  let position = 0;
  let match;
  while ((match = tokenPattern.exec(formatted))) {
    if (match.index > position) tokens.push(formatted.slice(position, match.index));
    const className = match[1] ? 'har-code__key' : match[2] ? 'har-code__string' :
      match[3] ? 'har-code__literal' : 'har-code__number';
    tokens.push(<span className={className} key={`${match.index}-${className}`}>{match[0]}</span>);
    position = tokenPattern.lastIndex;
  }
  if (position < formatted.length) tokens.push(formatted.slice(position));
  return <pre className="har-code har-code--json">{tokens}</pre>;
}

function DetailsList({ title, items }) {
  return (
    <section className="har-inspector__section">
      <h4>{title}</h4>
      {items.length ? (
        <dl className="har-details-list">
          {items.map((item, index) => (
            <div key={`${item.name}-${index}`}>
              <dt>{item.name}</dt><dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="har-empty">Not recorded in this HAR entry.</p>}
    </section>
  );
}

/**
 * Renders a privacy-preserving, browser-only HAR archive analyzer.
 * @returns {React.JSX.Element}
 */
export default function HarTool() {
  const [rawInput, setRawInput] = useState('');
  const [har, setHar] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ url: '', method: '', status: '', resourceType: '' });
  const [selectedId, setSelectedId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const overview = useMemo(() => getOverview(har?.entries ?? []), [har]);
  const filteredEntries = useMemo(
    () => filterEntries(har?.entries ?? [], filters),
    [har, filters]
  );
  const selectedEntry = filteredEntries.find((entry) => entry.id === selectedId) ?? filteredEntries[0];
  const methods = useMemo(
    () => [...new Set((har?.entries ?? []).map((entry) => entry.request.method).filter(Boolean))].sort(),
    [har]
  );
  const timelineStart = Math.min(...filteredEntries.map((entry) => entry.startedAt));
  const timelineEnd = Math.max(...filteredEntries.map((entry) => entry.startedAt + entry.duration));
  const timelineSpan = Math.max(timelineEnd - timelineStart, 1);

  function analyze(text) {
    try {
      const nextHar = parseHar(text);
      setRawInput(text);
      setHar(nextHar);
      setError('');
      setSelectedId(nextHar.entries[0]?.id ?? null);
    } catch (parseError) {
      setHar(null);
      setSelectedId(null);
      setError(parseError.message);
    }
  }

  async function readFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.har') && !/json/.test(file.type)) {
      setError('Choose a .har or JSON file. Nothing was uploaded.');
      return;
    }
    try {
      analyze(await file.text());
    } catch {
      setError('The selected file could not be read locally.');
    }
  }

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
    setSelectedId(null);
  }

  function reset() {
    setRawInput('');
    setHar(null);
    setError('');
    setSelectedId(null);
    setFilters({ url: '', method: '', status: '', resourceType: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="har-tool" aria-label="HAR Analyzer">
      <div className="har-tool__intro">
        <div><p className="har-tool__eyebrow">Local-only analysis</p><h2>HAR Analyzer</h2></div>
        <p>Files and pasted traffic stay in this browser; this tool sends no HAR data anywhere.</p>
      </div>

      <div
        className={`har-dropzone ${dragging ? 'har-dropzone--active' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); readFile(event.dataTransfer.files?.[0]); }}
      >
        <strong>Drop a .har file here</strong><span>or</span>
        <label className="har-button">Choose HAR file
          <input ref={fileInputRef} type="file" accept=".har,application/json" onChange={(event) => readFile(event.target.files?.[0])} />
        </label>
      </div>

      <div className="har-input-panel">
        <label htmlFor="har-input">Paste raw HAR JSON</label>
        <textarea id="har-input" value={rawInput} onChange={(event) => setRawInput(event.target.value)} placeholder='{"log": {"entries": []}}' spellCheck={false} />
        <div className="har-actions"><button className="har-button" type="button" onClick={() => analyze(rawInput)}>Analyze HAR</button><button className="har-button har-button--quiet" type="button" onClick={reset}>Clear</button></div>
      </div>

      {error && <div className="har-error" role="alert">{error}</div>}

      {har && <>
        <section className="har-overview" aria-label="Overview statistics">
          <article><span>Total requests</span><strong>{overview.totalRequests}</strong></article>
          <article><span>Transfer size</span><strong>{formatBytes(overview.totalTransferSize)}</strong></article>
          <article><span>Load time</span><strong>{formatDuration(overview.totalLoadTime)}</strong></article>
          <article className="har-overview__status"><span>Status codes</span><strong>{Object.entries(overview.statusCounts).filter(([, count]) => count).map(([group, count]) => `${group}: ${count}`).join(' · ') || 'None'}</strong></article>
        </section>

        <section className="har-distribution" aria-label="Response size distribution">
          <h3>Response size distribution</h3>
          {overview.sizeDistribution.map((bin) => <div key={bin.label}><span>{bin.label}</span><div><i style={{ width: `${overview.totalRequests ? (bin.count / overview.totalRequests) * 100 : 0}%` }} /></div><strong>{bin.count}</strong></div>)}
        </section>

        <section className="har-filters" aria-label="Request filters">
          <label>URL <input value={filters.url} onChange={(event) => updateFilter('url', event.target.value)} placeholder="Contains…" /></label>
          <label>Method <select value={filters.method} onChange={(event) => updateFilter('method', event.target.value)}><option value="">All methods</option>{methods.map((method) => <option key={method}>{method}</option>)}</select></label>
          <label>Status <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">All statuses</option><option value="200">2xx</option><option value="300">3xx</option><option value="400">4xx</option><option value="500">5xx</option><option value="other">Other</option></select></label>
          <label>Type <select value={filters.resourceType} onChange={(event) => updateFilter('resourceType', event.target.value)}><option value="">All types</option>{RESOURCE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
        </section>

        <p className="har-results-count">Showing {filteredEntries.length} of {overview.totalRequests} requests</p>
        <section className="har-waterfall" aria-label="Request waterfall timeline"><h3>Waterfall timeline</h3>
          <div className="har-waterfall__legend">{TIMING_PHASES.map(([phase, label]) => <span key={phase} className={`har-phase har-phase--${phase}`}>{label}</span>)}</div>
          {filteredEntries.length ? filteredEntries.map((entry) => <button key={entry.id} type="button" className={`har-waterfall__row ${selectedEntry?.id === entry.id ? 'har-waterfall__row--selected' : ''}`} onClick={() => setSelectedId(entry.id)}>
            <span className="har-waterfall__request"><b>{entry.request.method || '—'}</b><em className={`har-status har-status--${Math.floor(Number(entry.response.status) / 100) || 0}`}>{entry.response.status || '—'}</em><span>{entry.request.url || 'Untitled request'}</span></span>
            <span className="har-waterfall__track"><i className="har-waterfall__offset" style={{ width: `${((entry.startedAt - timelineStart) / timelineSpan) * 100}%` }} />{TIMING_PHASES.map(([phase]) => entry.timings[phase] ? <i key={phase} className={`har-phase har-phase--${phase}`} style={{ width: `${(entry.timings[phase] / timelineSpan) * 100}%` }} /> : null)}</span><time>{formatDuration(entry.duration)}</time>
          </button>) : <p className="har-empty">No requests match these filters.</p>}
        </section>

        {selectedEntry && <section className="har-inspector" aria-label="Request inspector"><div className="har-inspector__heading"><h3>{selectedEntry.request.method} {selectedEntry.request.url}</h3><span>{selectedEntry.resourceType} · {selectedEntry.response.status || 'No status'}</span></div><div className="har-inspector__grid">
          <DetailsList title="Request headers" items={selectedEntry.request.headers} /><DetailsList title="Response headers" items={selectedEntry.response.headers} />
          <DetailsList title="Query parameters" items={selectedEntry.request.queryString} /><DetailsList title="Request cookies" items={selectedEntry.request.cookies} />
          <DetailsList title="Response cookies" items={selectedEntry.response.cookies} />
          <section className="har-inspector__section"><h4>Request payload</h4><CodeBlock content={selectedEntry.request.postData?.text} mimeType={selectedEntry.request.postData?.mimeType} /></section>
          <section className="har-inspector__section har-inspector__section--wide"><h4>Response body</h4><CodeBlock content={selectedEntry.response.content?.text} mimeType={selectedEntry.response.content?.mimeType} /></section>
        </div></section>}
      </>}
    </section>
  );
}
