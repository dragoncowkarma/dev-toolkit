import { useMemo, useRef, useState } from 'react';
import { getComponentValue, parseIcalendar } from './icalendarParser.utils.js';
import './icalendar-parser.css';

const SAMPLE_ICALENDAR = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Dev Toolkit//iCalendar Parser//EN
BEGIN:VEVENT
UID:team-standup@example.com
DTSTAMP:20261109T090000Z
DTSTART;TZID=Asia/Seoul:20261110T100000
DTEND;TZID=Asia/Seoul:20261110T103000
SUMMARY:Team standup
RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=4
END:VEVENT
END:VCALENDAR`;

/**
 * Renders an in-browser iCalendar parser and validator.
 * @returns {React.JSX.Element}
 */
export default function IcalendarParserTool() {
  const [input, setInput] = useState(SAMPLE_ICALENDAR);
  const [query, setQuery] = useState('');
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef(null);
  const result = useMemo(() => parseIcalendar(input), [input]);
  const validationErrors = result.issues.filter((issue) => issue.severity === 'error');
  const errorCount = validationErrors.length;
  const warningCount = result.issues.length - errorCount;
  const visibleEvents = result.events.filter((event) => {
    const searchable = ['UID', 'SUMMARY', 'DTSTART', 'DTEND']
      .map((name) => getComponentValue(event, name))
      .join(' ')
      .toLowerCase();
    return searchable.includes(query.trim().toLowerCase());
  });

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setInput(await file.text());
      setFileError('');
    } catch {
      setFileError('The selected file could not be read.');
    }
  }

  function loadSample() {
    setInput(SAMPLE_ICALENDAR);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="icalendar-parser" aria-label="iCalendar parser and validator">
      <div className="icalendar-parser__toolbar">
        <label className="icalendar-parser__button icalendar-parser__button--file">
          Upload .ics
          <input
            ref={fileInputRef}
            className="icalendar-parser__file-input"
            type="file"
            accept=".ics,text/calendar"
            onChange={handleFileChange}
            aria-label="Upload an iCalendar file"
          />
        </label>
        <button className="icalendar-parser__button" type="button" onClick={loadSample}>
          Load sample
        </button>
      </div>

      <label className="icalendar-parser__label" htmlFor="icalendar-input">
        iCalendar text
      </label>
      <textarea
        id="icalendar-input"
        className="icalendar-parser__input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        spellCheck={false}
        placeholder="Paste RFC 5545 .ics content here…"
      />

      {(fileError || errorCount > 0) && (
        <div className="icalendar-parser__alert" role="alert">
          {fileError || (
            <>
              <p>
                {errorCount} validation error{errorCount === 1 ? '' : 's'} found.
              </p>
              <ul>
                {validationErrors.map((issue) => (
                  <li key={`${issue.line}-${issue.message}`}>{issue.message}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <dl className="icalendar-parser__summary" aria-label="Parse summary">
        <div><dt>Events</dt><dd>{result.events.length}</dd></div>
        <div><dt>Errors</dt><dd>{errorCount}</dd></div>
        <div><dt>Warnings</dt><dd>{warningCount}</dd></div>
      </dl>

      <div className="icalendar-parser__table-header">
        <label className="icalendar-parser__label" htmlFor="icalendar-filter">
          Filter events
        </label>
        <input
          id="icalendar-filter"
          className="icalendar-parser__filter"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search title, UID, or date"
        />
      </div>
      <div className="icalendar-parser__table-wrap">
        <table className="icalendar-parser__table">
          <caption className="sr-only">
            Parsed iCalendar events and validation issues
          </caption>
          <thead>
            <tr>
              <th>Summary</th>
              <th>Start</th>
              <th>End</th>
              <th>UID</th>
              <th>Issues</th>
            </tr>
          </thead>
          <tbody>
            {visibleEvents.map((event) => {
              const eventIssues = result.issues.filter(
                (issue) => issue.line >= event.line
                  && issue.line <= (event.endLine ?? Number.MAX_SAFE_INTEGER)
              );
              return (
                <tr key={`${event.line}-${getComponentValue(event, 'UID')}`}>
                  <td>{getComponentValue(event, 'SUMMARY') || 'Untitled event'}</td>
                  <td>{getComponentValue(event, 'DTSTART') || '—'}</td>
                  <td>{getComponentValue(event, 'DTEND') || '—'}</td>
                  <td>{getComponentValue(event, 'UID') || '—'}</td>
                  <td>
                    {eventIssues.length > 0 ? eventIssues.map((issue) => (
                      <span
                        className={
                          `icalendar-parser__badge icalendar-parser__badge--${issue.severity}`
                        }
                        key={`${issue.line}-${issue.message}`}
                      >
                        {issue.message}
                      </span>
                    )) : (
                      <span className="icalendar-parser__badge icalendar-parser__badge--valid">
                        Valid
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {visibleEvents.length === 0 && (
              <tr>
                <td colSpan="5">No matching events.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
