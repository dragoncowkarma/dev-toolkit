import { describe, expect, it } from 'vitest';
import {
  decodeIcalendarText,
  parseContentLine,
  parseIcalendar,
  unfoldContentLines,
} from './icalendarParser.utils.js';

const VALID_ICALENDAR = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:one@example.com',
  'DTSTAMP:20261109T090000Z',
  'DTSTART;TZID=Asia/Seoul:20261110T100000',
  'DTEND;TZID=Asia/Seoul:20261110T110000',
  'SUMMARY:Planning\\, review\\; notes\\nnext line',
  'RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('iCalendar content parsing', () => {
  it('unfolds CRLF continuation lines', () => {
    expect(unfoldContentLines('SUMMARY:Long\r\n title\r\nUID:1')).toEqual([
      'SUMMARY:Longtitle',
      'UID:1',
    ]);
  });

  it('parses multi-value parameters and escaped text', () => {
    const property = parseContentLine('ATTENDEE;ROLE=REQ-PARTICIPANT;MEMBER="a,b",c:Jane\\, Doe');
    expect(property.params.MEMBER).toEqual(['a,b', 'c']);
    expect(property.value).toBe('Jane, Doe');
  });

  it('decodes RFC 5545 escaped characters', () => {
    expect(decodeIcalendarText('a\\,b\\;c\\nnext\\:item')).toBe('a,b;c\nnext:item');
  });
});

describe('parseIcalendar validation', () => {
  it('accepts a valid calendar fixture', () => {
    const result = parseIcalendar(VALID_ICALENDAR);
    expect(result.events).toHaveLength(1);
    expect(result.issues).toEqual([]);
  });

  it('reports missing fields, invalid dates, and invalid recurrence rules', () => {
    const result = parseIcalendar([
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:x',
      'DTSTART;VALUE=DATE:20261110T100000',
      'RRULE:FREQ=NEVER;INTERVAL=0;UNTIL=20261201;COUNT=2',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n'));
    expect(result.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      'VEVENT is missing required DTSTAMP.',
      'DTSTART must use a valid DATE value.',
      'RRULE must include a valid FREQ value.',
      'RRULE INTERVAL must be a positive integer.',
      'RRULE cannot include both UNTIL and COUNT.',
    ]));
  });

  it('rejects impossible calendar dates that match the DATE syntax', () => {
    const result = parseIcalendar(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:impossible-date
DTSTAMP:20261109T090000Z
DTSTART;VALUE=DATE:20260230
END:VEVENT
END:VCALENDAR`);

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        line: 5,
        message: 'DTSTART must use a valid DATE value.',
        severity: 'error',
      }),
    ]));
  });

  it('detects duplicate event UIDs', () => {
    const event = (stamp) => [
      'BEGIN:VEVENT',
      'UID:duplicate',
      `DTSTAMP:${stamp}`,
      'DTSTART:20261110T100000Z',
      'END:VEVENT',
    ].join('\n');
    const result = parseIcalendar([
      'BEGIN:VCALENDAR',
      event('20261109T090000Z'),
      event('20261109T100000Z'),
      'END:VCALENDAR',
    ].join('\n'));
    expect(
      result.issues.some((issue) => issue.message === 'Duplicate event UID: duplicate.')
    ).toBe(true);
  });
});
