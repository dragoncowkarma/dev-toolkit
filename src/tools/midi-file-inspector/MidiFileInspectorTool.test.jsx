import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import MidiFileInspectorTool from './MidiFileInspectorTool.jsx';

afterEach(() => {
  cleanup();
});

// MThd (format 1, 1 track, division 480) followed by an MTrk chunk whose first event has a
// malformed variable-length quantity (5 continuation bytes, which exceeds the 4-byte VLQ limit).
const MALFORMED_VLQ_TRACK_BYTES = Uint8Array.from([
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x01, 0x00, 0x01, 0x01, 0xe0, 0x4d, 0x54,
  0x72, 0x6b, 0x00, 0x00, 0x00, 0x08, 0xff, 0xff, 0xff, 0xff, 0x7f, 0xff, 0x2f, 0x00,
]);

function makeMidiFile(bytes, name = 'test.mid') {
  const file = new File([bytes], name);
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => bytes.buffer,
  });
  return file;
}

function selectFile(file) {
  const input = screen.getByLabelText('Choose a MIDI file');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

describe('MidiFileInspectorTool', () => {
  it('renders a malformed track scan as an alert region', async () => {
    render(<MidiFileInspectorTool />);
    selectFile(makeMidiFile(MALFORMED_VLQ_TRACK_BYTES));

    const alerts = await screen.findAllByRole('alert');
    const alertText = alerts.map((node) => node.textContent).join(' ');
    expect(alertText).toMatch(/malformed event data/i);
    expect(alertText).toMatch(/Malformed variable-length quantity/i);
  });

  it('rejects a non-MIDI file with an alert', () => {
    render(<MidiFileInspectorTool />);
    selectFile(makeMidiFile(Uint8Array.from([0x00, 0x01]), 'not-midi.txt'));

    expect(screen.getByRole('alert')).toHaveTextContent('Please choose a .mid or .midi file.');
  });
});
