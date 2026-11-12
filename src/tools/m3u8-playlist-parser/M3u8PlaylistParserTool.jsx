import { useMemo, useRef, useState } from 'react';
import { getTotalDuration, parseM3u8Playlist } from './m3u8-playlist-parser.utils.js';
import './m3u8-playlist-parser.css';

const SAMPLE_MASTER_PLAYLIST = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2",AUDIO="main"
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2560000,RESOLUTION=1920x1080
high/index.m3u8`;

const SAMPLE_MEDIA_PLAYLIST = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"
#EXTINF:9.8,Opening segment
segment0.ts
#EXTINF:9.5,
segment1.ts
#EXT-X-ENDLIST`;

function formatDuration(duration) {
  return `${duration.toFixed(2)} s`;
}

/**
 * Renders a client-side HLS playlist parser and validator.
 * @returns {React.JSX.Element} M3U8 parser tool.
 */
export default function M3u8PlaylistParserTool() {
  const [source, setSource] = useState('');
  const [filter, setFilter] = useState('');
  const fileInputRef = useRef(null);
  const result = useMemo(() => parseM3u8Playlist(source), [source]);
  const entries = result.type === 'Master' ? result.variants : result.segments;
  const filteredEntries = entries.filter((entry) => {
    const searchable = [entry.uri, entry.title ?? '', JSON.stringify(entry.attributes ?? {})].join(' ');
    return searchable.toLowerCase().includes(filter.trim().toLowerCase());
  });

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (file) setSource(await file.text());
  }

  function loadSample(sample) {
    setSource(sample);
    setFilter('');
  }

  return (
    <section className="m3u8-parser" aria-label="M3U8 Playlist Parser">
      <div className="m3u8-parser__actions">
        <label className="m3u8-parser__button m3u8-parser__upload">
          Upload .m3u8
          <input
            ref={fileInputRef}
            className="m3u8-parser__file-input"
            type="file"
            accept=".m3u8,application/vnd.apple.mpegurl,application/x-mpegURL"
            onChange={handleFileChange}
            aria-label="Upload an M3U8 playlist"
          />
        </label>
        <button
          type="button"
          className="m3u8-parser__button"
          onClick={() => loadSample(SAMPLE_MASTER_PLAYLIST)}
        >
          Load master sample
        </button>
        <button
          type="button"
          className="m3u8-parser__button"
          onClick={() => loadSample(SAMPLE_MEDIA_PLAYLIST)}
        >
          Load media sample
        </button>
        <button type="button" className="m3u8-parser__button" onClick={() => setSource('')}>
          Clear
        </button>
      </div>

      <label className="m3u8-parser__label" htmlFor="m3u8-source">Playlist source</label>
      <textarea
        id="m3u8-source"
        className="m3u8-parser__source"
        value={source}
        onChange={(event) => setSource(event.target.value)}
        placeholder="Paste an HLS .m3u8 playlist…"
        spellCheck={false}
      />

      {source && (
        <>
          <div className="m3u8-parser__summary" aria-label="Playlist summary">
            <div><span>Type</span><strong>{result.type}</strong></div>
            <div>
              <span>{result.type === 'Master' ? 'Variants' : 'Segments'}</span>
              <strong>{entries.length}</strong>
            </div>
            <div>
              <span>Total duration</span>
              <strong>{formatDuration(getTotalDuration(result.segments))}</strong>
            </div>
            <div>
              <span>Errors / warnings</span>
              <strong>{result.errors.length} / {result.warnings.length}</strong>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="m3u8-parser__alert" role="alert">
              {result.errors.map((issue) => (
                <p key={`${issue.line}-${issue.message}`}>
                  Line {issue.line}: {issue.message}
                </p>
              ))}
            </div>
          )}

          <label className="m3u8-parser__label" htmlFor="m3u8-filter">
            Filter {result.type === 'Master' ? 'variants' : 'segments'}
          </label>
          <input
            id="m3u8-filter"
            className="m3u8-parser__filter"
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search URI, title, or attributes"
          />
          <div className="m3u8-parser__table-wrap">
            <table className="m3u8-parser__table">
              <caption className="sr-only">
                Parsed {result.type === 'Master' ? 'variant streams' : 'segments'}
              </caption>
              <thead>
                <tr>
                  <th>URI</th>
                  <th>{result.type === 'Master' ? 'Attributes' : 'Duration / title'}</th>
                  <th>Issues</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr key={`${entry.line}-${entry.uri}`}>
                    <td>{entry.uri || 'Missing URI'}</td>
                    <td>
                      {result.type === 'Master'
                        ? Object.entries(entry.attributes).map(([key, value]) => `${key}=${value}`).join(', ')
                        : `${formatDuration(entry.duration)} ${entry.title}`}
                    </td>
                    <td>
                      {entry.issues.length ? entry.issues.map((issue) => (
                        <span
                          className={`m3u8-parser__badge m3u8-parser__badge--${issue.level}`}
                          key={issue.message}
                        >
                          {issue.level}
                        </span>
                      )) : <span className="m3u8-parser__badge">Valid</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
