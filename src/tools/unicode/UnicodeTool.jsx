import { useMemo, useState } from 'react';
import {
  compareNormalizations,
  detectInvisibles,
  inspectText,
  parseCodePointInput,
  toEscapes,
} from './unicode.utils.js';
import './unicode.css';

const ROW_LIMIT = 500;

function formatValues(values, width = 2) {
  if (!values) return '—';
  return values.map((value) => value.toString(16).toUpperCase().padStart(width, '0')).join(' ');
}

function CharacterRecord({ record }) {
  const escapes = toEscapes(record.codePoint);
  return (
    <div className="unicode-tool__record">
      <p>
        <strong>Character:</strong> <span className="unicode-tool__character">{record.char}</span>
      </p>
      <p><strong>Code point:</strong> {record.hex} ({record.codePoint})</p>
      <p><strong>UTF-8:</strong> {formatValues(record.utf8Bytes)}</p>
      <p><strong>UTF-16:</strong> {formatValues(record.utf16Units, 4)}</p>
      <p><strong>Label:</strong> {record.label}</p>
      {escapes && <p><strong>Escapes:</strong> {Object.values(escapes).join(' · ')}</p>}
    </div>
  );
}

/**
 * Renders live code-point inspection, invisible-character detection, normalization, and lookup.
 *
 * @returns {React.JSX.Element} Unicode Inspector user interface.
 */
export default function UnicodeTool() {
  const [text, setText] = useState('');
  const [lookupInput, setLookupInput] = useState('');
  const [notice, setNotice] = useState('');
  const records = useMemo(() => inspectText(text), [text]);
  const invisibles = useMemo(() => detectInvisibles(text), [text]);
  const normalizations = useMemo(() => compareNormalizations(text), [text]);
  const lookupCodePoint = parseCodePointInput(lookupInput);
  const lookupRecord = lookupCodePoint === null
    ? null
    : inspectText(String.fromCodePoint(lookupCodePoint))[0];
  const visibleRecords = records.slice(0, ROW_LIMIT);

  async function handleCopy(form, normalizedText) {
    try {
      await navigator.clipboard.writeText(normalizedText);
      setNotice(`${form} copied to clipboard.`);
    } catch {
      setNotice(`Unable to copy ${form}.`);
    }
  }

  return (
    <section className="unicode-tool" aria-label="Unicode Inspector">
      <p className="unicode-tool__notice" role="status" aria-live="polite">{notice}</p>
      <section className="unicode-tool__section" aria-labelledby="unicode-inspect-heading">
        <h2 id="unicode-inspect-heading">Inspect</h2>
        <label htmlFor="unicode-inspect-input">Text to inspect</label>
        <textarea
          id="unicode-inspect-input"
          aria-label="Text to inspect"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste or type text to inspect each Unicode code point…"
          spellCheck={false}
        />
        {!records.length ? (
          <p className="unicode-tool__hint">Enter text to see its code-point breakdown.</p>
        ) : (
          <div className="unicode-tool__table-wrap">
            {records.length > ROW_LIMIT && (
              <p>Showing first {ROW_LIMIT} of {records.length} characters.</p>
            )}
            <table>
              <thead><tr>
                <th scope="col">Character</th><th scope="col">Code point</th>
                <th scope="col">Decimal</th><th scope="col">UTF-8 bytes</th>
                <th scope="col">UTF-16 units</th><th scope="col">Escapes</th>
              </tr></thead>
              <tbody>{visibleRecords.map((record, index) => {
                const escapes = toEscapes(record.codePoint);
                return <tr key={`${index}-${record.hex}`}>
                  <td title={record.label} className="unicode-tool__character">{record.char}</td>
                  <td>{record.hex}</td><td>{record.codePoint}</td>
                  <td>{formatValues(record.utf8Bytes)}</td>
                  <td>{formatValues(record.utf16Units, 4)}</td>
                  <td>{escapes
                    ? Object.entries(escapes).map(([name, value]) => `${name}: ${value}`).join('\n')
                    : 'Invalid scalar'}
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="unicode-tool__section" aria-labelledby="unicode-invisible-heading">
        <h2 id="unicode-invisible-heading">Invisible characters</h2>
        {!invisibles.length ? (
          <p className="unicode-tool__hint">No invisible characters found.</p>
        ) : (
          <ul className="unicode-tool__invisibles">{invisibles.map((item) => (
            <li key={`${item.index}-${item.hex}`}>Position {item.index}: {item.hex} — {item.label}
              <span className={`unicode-tool__risk unicode-tool__risk--${item.risk}`}>
                {item.risk} risk
              </span>
            </li>
          ))}</ul>
        )}
      </section>

      <section className="unicode-tool__section" aria-labelledby="unicode-normalization-heading">
        <h2 id="unicode-normalization-heading">Normalization</h2>
        <div className="unicode-tool__normalizations">
          {Object.entries(normalizations).map(([form, result]) => (
            <div key={form} className="unicode-tool__normalization">
              <strong>{form}</strong><span>{result.changed ? 'Changed' : 'Unchanged'}</span>
              <output aria-label={`${form} normalized text`}>{result.text || 'Empty input'}</output>
              <button
                type="button"
                aria-label={`Copy ${form} normalization`}
                onClick={() => handleCopy(form, result.text)}
              >
              Copy {form}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="unicode-tool__section" aria-labelledby="unicode-lookup-heading">
        <h2 id="unicode-lookup-heading">Lookup</h2>
        <label htmlFor="unicode-lookup-input">Code point</label>
        <input
          id="unicode-lookup-input"
          aria-label="Code point"
          value={lookupInput}
          onChange={(event) => setLookupInput(event.target.value)}
          placeholder="U+1F600, 128512, or &#x1F600;"
          spellCheck={false}
        />
        {!lookupInput.trim() && (
          <p className="unicode-tool__hint">Enter a code point to look up a character.</p>
        )}
        {lookupInput.trim() && !lookupRecord && (
          <p className="unicode-tool__hint">Invalid code point.</p>
        )}
        {lookupRecord && <CharacterRecord record={lookupRecord} />}
      </section>
    </section>
  );
}
