import { describe, expect, it } from 'vitest';
import {
  decodeIcalendarText,
  parseContentLine,
  parseIcalendar,
  unfoldContentLines,
} from './icalendarParser.utils.js';

const VALID_ICALENDAR = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:one@example.com\r\nDTSTAMP:20261109T090000Z\r\nDTSTART;TZID=Asia/Seoul:20261110T100000\r\nDTEND;TZID=Asia/Seoul:20261110T110000\r\nSUMMARY:Planning\\, review\\; notes\\nnext line\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3\r\nEND:VEVENT\r\nEND:VCALENDAR`;

describe('iCalendar content parsing', () => {
  it('unfolds CRLF continuation lines', () => {
    expect(unfoldContentLines('SUMMARY:Long\r\n title\r\nUID:1')).toEqual(['SUMMARY:Longtitle', 'UID:1']);
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
    const result = parseIcalendar(`BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:x\nDTSTART;VALUE=DATE:20261110T100000\nRRULE:FREQ=NEVER;INTERVAL=0;UNTIL=20261201;COUNT=2\nEND:VEVENT\nEND:VCALENDAR`);
    expect(result.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      'VEVENT is missing required DTSTAMP.',
      'DTSTART must use a valid DATE value.',
      'RRULE must include a valid FREQ value.',
      'RRULE INTERVAL must be a positive integer.',
      'RRULE cannot include both UNTIL and COUNT.',
    ]));
  });

  it('detects duplicate event UIDs', () => {
    const event = (stamp) => `BEGIN:VEVENT\nUID:duplicate\nDTSTAMP:${stamp}\nDTSTART:20261110T100000Z\nEND:VEVENT`;
    const result = parseIcalendar(`BEGIN:VCALENDAR\n${event('20261109T090000Z')}\n${event('20261109T100000Z')}\nEND:VCALENDAR`);
    expect(result.issues.some((issue) => issue.message === 'Duplicate event UID: duplicate.')).toBe(true);
  });
});
