import { describe, expect, it } from 'vitest';
import {
  decodeIcalendarDate,
  parseIcalendar,
  parseIcalendarProperty,
  unfoldIcalendarLines,
} from './icalendar.utils.js';

describe('unfoldIcalendarLines', () => {
  it('joins CRLF folded continuations before properties are parsed', () => {
    expect(unfoldIcalendarLines('SUMMARY:Project\r\n kickoff\r\nUID:one')).toEqual([
      { value: 'SUMMARY:Projectkickoff', lineNumber: 1 },
      { value: 'UID:one', lineNumber: 3 },
    ]);
  });
});

describe('parseIcalendarProperty', () => {
  it('keeps TZID and VALUE parameters', () => {
    expect(parseIcalendarProperty('DTSTART;VALUE=DATE;TZID=Asia/Seoul:20261110', 7)).toMatchObject({
      name: 'DTSTART',
      params: { VALUE: 'DATE', TZID: 'Asia/Seoul' },
      value: '20261110',
      lineNumber: 7,
    });
  });

  it('splits the value after colons inside quoted parameter values', () => {
    expect(
      parseIcalendarProperty('ATTENDEE;CN="Role: Host":mailto:host@example.com', 4),
    ).toMatchObject({
      name: 'ATTENDEE',
      params: { CN: 'Role: Host' },
      value: 'mailto:host@example.com',
    });
  });
});

describe('decodeIcalendarDate', () => {
  it('decodes valid VALUE=DATE properties as all-day dates', () => {
    expect(decodeIcalendarDate({ value: '20261110', params: { VALUE: 'DATE' } })).toEqual({
      display: '2026-11-10 (all day)',
    });
  });

  it('rejects invalid VALUE=DATE calendar dates', () => {
    expect(decodeIcalendarDate({ value: '20260230', params: { VALUE: 'DATE' } })).toEqual({
      display: '20260230',
      error: 'Expected a valid YYYYMMDD date.',
    });
  });
});

describe('parseIcalendar', () => {
  it('parses nested VCALENDAR, VEVENT, VTODO, and VALARM components', () => {
    const result = parseIcalendar([
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:event-1',
      'DTSTAMP:20261101T000000Z',
      'DTSTART;TZID=Asia/Seoul:20261110T090000',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'END:VALARM',
      'END:VEVENT',
      'BEGIN:VTODO',
      'UID:todo-1',
      'SUMMARY:Ship\\, review',
      'END:VTODO',
      'END:VCALENDAR',
    ].join('\n'));
    const calendar = result.components[0];
    expect(result.errors).toEqual([]);
    expect(calendar.name).toBe('VCALENDAR');
    expect(calendar.children.map((component) => component.name)).toEqual(['VEVENT', 'VTODO']);
    expect(calendar.children[0].children[0].name).toBe('VALARM');
    const startsAt = calendar.children[0].properties.find(
      (property) => property.name === 'DTSTART',
    );
    expect(startsAt.displayValue).toBe('2026-11-10 09:00:00 (Asia/Seoul)');
  });

  it('reports a source line for unmatched components and missing UID', () => {
    const result = parseIcalendar(
      'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTAMP:20261101T000000Z\nEND:VTODO',
    );
    expect(result.errors.map((error) => error.message)).toEqual(expect.arrayContaining([
      'END:VTODO does not match BEGIN:VEVENT.',
      'VEVENT is missing required UID.',
    ]));
    expect(result.errors.some((error) => error.lineNumber === 4)).toBe(true);
  });

  it('reports malformed DTSTART and DTEND values with their source lines', () => {
    const result = parseIcalendar([
      'BEGIN:VEVENT',
      'UID:event-1',
      'DTSTAMP:20261101T000000Z',
      'DTSTART:bad-date',
      'DTEND;VALUE=DATE:20260230',
      'END:VEVENT',
    ].join('\n'));

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        lineNumber: 4,
        message: 'DTSTART: Expected a valid YYYYMMDDTHHMMSS date-time.',
      }),
      expect.objectContaining({
        lineNumber: 5,
        message: 'DTEND: Expected a valid YYYYMMDD date.',
      }),
    ]));
  });
});
