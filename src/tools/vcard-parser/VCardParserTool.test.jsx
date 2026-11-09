import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import VCardParserTool from './VCardParserTool.jsx';
import { parseVCards, unfoldVCardLines } from './vcardParser.utils.js';

afterEach(cleanup);

const MULTI_CARD_SAMPLE = `BEGIN:VCARD
VERSION:4.0
FN:Alex Example
ORG:Example Corp;Platform
TITLE:Engineer
TEL;TYPE=work,voice:+1-555-0100
EMAIL;TYPE=work:alex@example.test
ADR;TYPE=work:;;1 Main Street;Seoul;;;Korea
NOTE:This note is folded
 across two content lines.
PHOTO:https://images.example.test/alex.jpg
END:VCARD
BEGIN:VCARD
VERSION:3.0
N:Broken;Contact;;;
EMAIL;TYPE=home:broken@example.test
END:VCARD
BEGIN:VCARD
VERSION:2.1
N:Legacy;Person;;;
TEL;HOME:+1-555-0101
END:VCARD`;

describe('vCard parser utilities', () => {
  it('unfolds RFC continuation lines by removing one leading whitespace character', () => {
    expect(unfoldVCardLines('NOTE:Hello\r\n world\r\n\tagain')).toEqual(['NOTE:Helloworldagain']);
  });

  it('parses valid multi-card data while reporting a malformed card independently', () => {
    const cards = parseVCards(MULTI_CARD_SAMPLE);

    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatchObject({ version: '4.0', fullName: 'Alex Example', title: 'Engineer' });
    expect(cards[0].organization).toEqual(['Example Corp', 'Platform']);
    expect(cards[0].phones).toEqual([{ value: '+1-555-0100', types: ['work', 'voice'] }]);
    expect(cards[0].emails).toEqual([{ value: 'alex@example.test', types: ['work'] }]);
    expect(cards[0].notes).toEqual(['This note is foldedacross two content lines.']);
    expect(cards[0].photos).toEqual([{ value: 'https://images.example.test/alex.jpg', external: true }]);
    expect(cards[0].warnings).toContain('PHOTO contains an external reference and was not loaded.');
    expect(cards[0].errors).toEqual([]);
    expect(cards[1].errors).toContain('Missing required FN property.');
    expect(cards[2].errors).toEqual([]);
  });

  it('accepts N as the required name only for version 2.1', () => {
    const [card] = parseVCards('BEGIN:VCARD\nVERSION:2.1\nN:Example;Alex;;;\nEND:VCARD');
    expect(card.errors).toEqual([]);
    expect(card.name).toMatchObject({ family: 'Example', given: 'Alex' });
  });

  it('reports missing boundaries and unsupported versions clearly', () => {
    const [versionCard] = parseVCards('BEGIN:VCARD\nVERSION:9.0\nFN:Alex\nEND:VCARD');
    expect(versionCard.errors).toContain('Unsupported or malformed VERSION: 9.0.');

    const [boundaryCard] = parseVCards('VERSION:4.0\nFN:Alex');
    expect(boundaryCard.errors).toEqual(expect.arrayContaining([
      'Card must start with BEGIN:VCARD.',
      'Card must end with END:VCARD.',
    ]));
  });
});

describe('VCardParserTool', () => {
  it('renders each vCard separately with status and validation feedback', () => {
    render(<VCardParserTool />);
    fireEvent.change(screen.getByLabelText('VCF content'), {
      target: { value: MULTI_CARD_SAMPLE },
    });

    expect(screen.getByRole('status')).toHaveTextContent('2 of 3 cards valid');
    expect(screen.getByRole('heading', { name: 'Alex Example' })).toBeInTheDocument();
    expect(screen.getAllByText('Needs attention')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Missing required FN property.');
    expect(screen.getByText('External reference (not loaded)')).toBeInTheDocument();
  });
});
