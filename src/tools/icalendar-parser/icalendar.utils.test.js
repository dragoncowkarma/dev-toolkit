import { describe, expect, it } from 'vitest';
import { parseIcalendar, parseIcalendarProperty, unfoldIcalendarLines } from './icalendar.utils.js';

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
});

describe('parseIcalendar', () => {
  it('parses nested VCALENDAR, VEVENT, VTODO, and VALARM components', () => {
    const result = parseIcalendar(`BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:event-1\nDTSTAMP:20261101T000000Z\nDTSTART;TZID=Asia/Seoul:20261110T090000\nBEGIN:VALARM\nACTION:DISPLAY\nEND:VALARM\nEND:VEVENT\nBEGIN:VTODO\nUID:todo-1\nSUMMARY:Ship\\, review\nEND:VTODO\nEND:VCALENDAR`);
    const calendar = result.components[0];
    expect(result.errors).toEqual([]);
    expect(calendar.name).toBe('VCALENDAR');
    expect(calendar.children.map((component) => component.name)).toEqual(['VEVENT', 'VTODO']);
    expect(calendar.children[0].children[0].name).toBe('VALARM');
    expect(calendar.children[0].properties.find((property) => property.name === 'DTSTART').displayValue).toBe('2026-11-10 09:00:00 (Asia/Seoul)');
  });

  it('reports a source line for unmatched components and missing UID', () => {
    const result = parseIcalendar('BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTAMP:20261101T000000Z\nEND:VTODO');
    expect(result.errors.map((error) => error.message)).toEqual(expect.arrayContaining([
      'END:VTODO does not match BEGIN:VEVENT.',
      'VEVENT is missing required UID.',
    ]));
    expect(result.errors.some((error) => error.lineNumber === 4)).toBe(true);
  });
});
