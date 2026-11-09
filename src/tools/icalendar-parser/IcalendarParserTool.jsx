import { useEffect, useRef, useState } from 'react';
import { parseIcalendar } from './icalendar.utils.js';
import './icalendar.css';

const EXAMPLE = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:team-sync@example.com\r\nDTSTAMP:20261109T010000Z\r\nDTSTART;TZID=Asia/Seoul:20261110T090000\r\nDTEND;TZID=Asia/Seoul:20261110T093000\r\nSUMMARY:Team sync\r\nEND:VEVENT\r\nEND:VCALENDAR`;

function ComponentTree({ component, depth = 0 }) {
  const summary = component.properties.find((property) => property.name === 'SUMMARY');
  const fields = ['DTSTART', 'DTEND', 'SUMMARY', 'RRULE', 'UID', 'STATUS'];
  return (
    <li className="icalendar-tree__item" style={{ '--tree-depth': depth }}>
      <strong>{component.name}</strong>{summary ? ` — ${summary.displayValue ?? summary.value}` : ''}
      <table className="icalendar-table">
        <tbody>
          {fields.map((name) => {
            const property = component.properties.find((item) => item.name === name);
            return property ? <tr key={name}><th>{name}</th><td>{property.displayValue ?? property.value}</td></tr> : null;
          })}
        </tbody>
      </table>
      {component.properties.length > 0 && (
        <details>
          <summary>Raw properties ({component.properties.length})</summary>
          <ul className="icalendar-raw-list">
            {component.properties.map((property) => <li key={`${property.lineNumber}-${property.raw}`}>Line {property.lineNumber}: {property.raw}</li>)}
          </ul>
        </details>
      )}
      {component.children.length > 0 && <ul className="icalendar-tree">{component.children.map((child) => <ComponentTree key={`${child.lineNumber}-${child.name}`} component={child} depth={depth + 1} />)}</ul>}
    </li>
  );
}

/**
 * Renders a client-side RFC 5545 iCalendar parser and validator.
 *
 * @returns {React.JSX.Element} The iCalendar parser UI.
 */
export default function IcalendarParserTool() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState({ components: [], errors: [] });
  const inputRef = useRef(null);
  const requestRef = useRef(0);

  useEffect(() => {
    setResult(input ? parseIcalendar(input) : { components: [], errors: [] });
  }, [input]);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const requestId = ++requestRef.current;
    try {
      const text = await file.text();
      if (requestId === requestRef.current) setInput(text);
    } catch {
      if (requestId === requestRef.current) {
        setResult({ components: [], errors: [{ lineNumber: 0, message: 'Could not read this file.', line: '' }] });
      }
    }
  }

  function clearInput() {
    requestRef.current += 1;
    setInput('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="icalendar-tool" aria-label="iCalendar Parser">
      <div className="icalendar-tool__actions">
        <label className="icalendar-tool__button">
          Upload .ics file
          <input ref={inputRef} type="file" accept=".ics,text/calendar" onChange={handleFileChange} aria-label="Upload iCalendar file" />
        </label>
        <button type="button" className="icalendar-tool__button" onClick={() => setInput(EXAMPLE)}>Load example</button>
        <button type="button" className="icalendar-tool__button" onClick={clearInput}>Clear</button>
      </div>
      <label className="icalendar-tool__label" htmlFor="icalendar-input">iCalendar text</label>
      <textarea id="icalendar-input" value={input} onChange={(event) => { requestRef.current += 1; setInput(event.target.value); }} placeholder="Paste RFC 5545 .ics content here…" spellCheck={false} />
      {result.errors.length > 0 && <section className="icalendar-errors" aria-label="Validation errors" role="alert"><strong>Validation errors</strong><ul>{result.errors.map((error, index) => <li key={`${error.lineNumber}-${index}`}>Line {error.lineNumber}: {error.message}{error.line ? ` (${error.line})` : ''}</li>)}</ul></section>}
      {result.components.length > 0 && <section aria-labelledby="icalendar-results"><h3 id="icalendar-results">Parsed components</h3><ul className="icalendar-tree">{result.components.map((component) => <ComponentTree key={`${component.lineNumber}-${component.name}`} component={component} />)}</ul></section>}
    </section>
  );
}
