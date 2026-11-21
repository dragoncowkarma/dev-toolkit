import { describe, expect, it } from 'vitest';
import {
  decodeDivision,
  formatFileSize,
  isMidiFile,
  parseMidiFile,
  readVariableLengthQuantity,
} from './midi-file-inspector.utils.js';

function bytesFromAscii(str) {
  return Array.from(str, (ch) => ch.charCodeAt(0));
}

function uint16(value) {
  return [(value >> 8) & 0xff, value & 0xff];
}

function uint32(value) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function buildMThdBytes({ format = 1, numTracks = 1, division = 480, length = 6 } = {}) {
  return [
    ...bytesFromAscii('MThd'),
    ...uint32(length),
    ...uint16(format),
    ...uint16(numTracks),
    ...uint16(division),
  ];
}

function buildMetaEvent(type, data = []) {
  return [0x00, 0xff, type, data.length, ...data];
}

function buildMTrkBytes(events) {
  const payload = events.flat();
  return [...bytesFromAscii('MTrk'), ...uint32(payload.length), ...payload];
}

function toArrayBuffer(bytes) {
  return new Uint8Array(bytes).buffer;
}

describe('parseMidiFile', () => {
  it('parses a Format 0 header with TPQN division', () => {
    const buffer = toArrayBuffer(buildMThdBytes({ format: 0, numTracks: 1, division: 96 }));
    const result = parseMidiFile(buffer);

    expect(result.errors).toEqual([]);
    expect(result.header.format).toBe(0);
    expect(result.header.formatLabel).toBe('Single track');
    expect(result.header.numTracks).toBe(1);
    expect(result.header.division).toEqual({ type: 'tpqn', ticksPerQuarterNote: 96 });
  });

  it('parses a Format 1 header with multiple tracks and TPQN division', () => {
    const header = buildMThdBytes({ format: 1, numTracks: 2, division: 480 });
    const trackA = buildMTrkBytes([buildMetaEvent(0x2f)]);
    const trackB = buildMTrkBytes([buildMetaEvent(0x2f)]);
    const buffer = toArrayBuffer([...header, ...trackA, ...trackB]);

    const result = parseMidiFile(buffer);

    expect(result.header.format).toBe(1);
    expect(result.header.formatLabel).toBe('Multiple synchronous tracks');
    expect(result.header.division).toEqual({ type: 'tpqn', ticksPerQuarterNote: 480 });
    expect(result.chunks.filter((chunk) => chunk.type === 'track')).toHaveLength(2);
  });

  it('labels an unknown format value gracefully', () => {
    const buffer = toArrayBuffer(buildMThdBytes({ format: 9 }));
    const result = parseMidiFile(buffer);

    expect(result.header.formatLabel).toBe('Unknown (9)');
  });

  it('decodes SMPTE time division embedded in the header', () => {
    // -25 fps => high byte 0xE7, 40 ticks per frame => low byte 0x28.
    const division = (0xe7 << 8) | 0x28;
    const buffer = toArrayBuffer(buildMThdBytes({ division }));
    const result = parseMidiFile(buffer);

    expect(result.header.division).toEqual({
      type: 'smpte',
      framesPerSecond: -25,
      ticksPerFrame: 40,
      label: '25 fps',
    });
  });

  it('lists MTrk chunks and extracts track name, tempo, and time signature', () => {
    const header = buildMThdBytes({ format: 1, numTracks: 1, division: 480 });
    const track = buildMTrkBytes([
      buildMetaEvent(0x03, bytesFromAscii('Piano')),
      buildMetaEvent(0x51, [0x07, 0xa1, 0x20]), // 500000 us/quarter -> 120 BPM
      buildMetaEvent(0x58, [4, 2, 24, 8]), // 4/4, 24 clocks/click, 8 notated 32nds
      buildMetaEvent(0x2f),
    ]);
    const buffer = toArrayBuffer([...header, ...track]);

    const result = parseMidiFile(buffer);
    const trackChunk = result.chunks.find((chunk) => chunk.type === 'track');

    expect(trackChunk.id).toBe('MTrk');
    expect(trackChunk.complete).toBe(true);
    expect(trackChunk.trackInfo.trackName).toBe('Piano');
    expect(trackChunk.trackInfo.tempoMicrosecondsPerQuarter).toBe(500000);
    expect(trackChunk.trackInfo.tempoBpm).toBe(120);
    expect(trackChunk.trackInfo.timeSignature).toEqual({
      numerator: 4,
      denominator: 4,
      clocksPerClick: 24,
      notated32ndNotesPerBeat: 8,
    });
    expect(trackChunk.trackInfo.endOfTrack).toBe(true);
  });

  it('tolerates running status and channel voice events without crashing', () => {
    const header = buildMThdBytes();
    const track = buildMTrkBytes([
      [0x00, 0x90, 0x3c, 0x40], // Note On, channel 0, note 60, velocity 64
      [0x10, 0x3e, 0x40], // running status: another Note On via implied status byte
      buildMetaEvent(0x2f),
    ]);
    const buffer = toArrayBuffer([...header, ...track]);

    const result = parseMidiFile(buffer);
    const trackChunk = result.chunks.find((chunk) => chunk.type === 'track');

    expect(trackChunk.trackInfo.malformed).toBeNull();
    expect(trackChunk.trackInfo.endOfTrack).toBe(true);
  });

  it('reports an error for non-MIDI magic bytes', () => {
    const buffer = toArrayBuffer([...bytesFromAscii('RIFF'), ...uint32(6), 0, 0, 0, 0, 0, 0]);
    const result = parseMidiFile(buffer);

    expect(result.header).toBeNull();
    expect(result.errors[0]).toMatch(/Invalid signature/);
  });

  it('reports an error for a truncated MThd chunk', () => {
    const fullHeader = buildMThdBytes();
    const buffer = toArrayBuffer(fullHeader.slice(0, fullHeader.length - 2));
    const result = parseMidiFile(buffer);

    expect(result.header).toBeNull();
    expect(result.errors[0]).toMatch(/Truncated MThd/);
  });

  it('marks a truncated MTrk chunk as incomplete and warns about it', () => {
    const header = buildMThdBytes();
    const track = buildMTrkBytes([
      buildMetaEvent(0x03, bytesFromAscii('Piano')),
      buildMetaEvent(0x2f),
    ]);
    // Declare the full track length but only provide the first 6 bytes of payload.
    const truncatedTrack = track.slice(0, 8 + 6);
    const buffer = toArrayBuffer([...header, ...truncatedTrack]);

    const result = parseMidiFile(buffer);
    const trackChunk = result.chunks.find((chunk) => chunk.type === 'track');

    expect(trackChunk.complete).toBe(false);
    expect(result.warnings.some((message) => message.includes('truncated'))).toBe(true);
  });

  it('tolerates an extended MThd length and reports it as a warning', () => {
    const buffer = toArrayBuffer([...buildMThdBytes({ length: 8 }), 0x00, 0x00]);
    const result = parseMidiFile(buffer);

    expect(result.header.length).toBe(8);
    expect(result.warnings.some((message) => message.includes('extended header length'))).toBe(
      true
    );
  });

  it('flags the event cap as an incomplete scan when a track exceeds MAX_TRACK_EVENTS', () => {
    const header = buildMThdBytes();
    const noteOnEvents = Array.from({ length: 5001 }, () => [0x00, 0x90, 0x3c, 0x40]);
    const track = buildMTrkBytes([...noteOnEvents, buildMetaEvent(0x2f)]);
    const buffer = toArrayBuffer([...header, ...track]);

    const result = parseMidiFile(buffer);
    const trackChunk = result.chunks.find((chunk) => chunk.type === 'track');

    expect(trackChunk.trackInfo.eventsScanned).toBe(5000);
    expect(trackChunk.trackInfo.endOfTrack).toBe(false);
    expect(trackChunk.trackInfo.eventCapReached).toBe(true);
    expect(trackChunk.trackInfo.truncated).toBe(true);
  });

  it('flags a track whose event data ends mid-scan without reaching End of Track', () => {
    const header = buildMThdBytes();
    const track = buildMTrkBytes([[0x00]]);
    const buffer = toArrayBuffer([...header, ...track]);

    const result = parseMidiFile(buffer);
    const trackChunk = result.chunks.find((chunk) => chunk.type === 'track');

    expect(trackChunk.trackInfo.endOfTrack).toBe(false);
    expect(trackChunk.trackInfo.truncated).toBe(true);
    expect(trackChunk.trackInfo.malformed).toBeNull();
  });

  it('clears running status after a Meta event so a later data byte is reported malformed', () => {
    const header = buildMThdBytes();
    const track = buildMTrkBytes([
      [0x00, 0x90, 0x3c, 0x40], // Note On
      [0x00, 0xff, 0x01, 0x00], // Meta event (text, zero length) cancels running status
      [0x00, 0x3e, 0x40], // bare data bytes relying on stale running status
    ]);
    const buffer = toArrayBuffer([...header, ...track]);

    const result = parseMidiFile(buffer);
    const trackChunk = result.chunks.find((chunk) => chunk.type === 'track');

    expect(trackChunk.trackInfo.malformed).toMatch(/Running status byte used before/);
  });

  it('clears running status after a SysEx event so a later data byte is reported malformed', () => {
    const header = buildMThdBytes();
    const track = buildMTrkBytes([
      [0x00, 0x90, 0x3c, 0x40], // Note On
      [0x00, 0xf0, 0x00], // SysEx event (zero length) cancels running status
      [0x00, 0x3e, 0x40], // bare data bytes relying on stale running status
    ]);
    const buffer = toArrayBuffer([...header, ...track]);

    const result = parseMidiFile(buffer);
    const trackChunk = result.chunks.find((chunk) => chunk.type === 'track');

    expect(trackChunk.trackInfo.malformed).toMatch(/Running status byte used before/);
  });

  it('records a malformed VLQ inside a track without throwing', () => {
    const header = buildMThdBytes();
    const track = buildMTrkBytes([[0xff, 0xff, 0xff, 0xff, 0x7f, 0xff, 0x2f, 0x00]]);
    const buffer = toArrayBuffer([...header, ...track]);

    const result = parseMidiFile(buffer);
    const trackChunk = result.chunks.find((chunk) => chunk.type === 'track');

    expect(trackChunk.trackInfo.malformed).toMatch(/Malformed variable-length quantity/);
  });
});

describe('decodeDivision', () => {
  it('decodes TPQN when bit 15 is 0', () => {
    expect(decodeDivision(480)).toEqual({ type: 'tpqn', ticksPerQuarterNote: 480 });
  });

  it('decodes 29.97 fps drop-frame SMPTE timecode', () => {
    const raw = (0xe3 << 8) | 80; // -29 fps, 80 ticks per frame
    expect(decodeDivision(raw)).toEqual({
      type: 'smpte',
      framesPerSecond: -29,
      ticksPerFrame: 80,
      label: '29.97 fps (drop-frame)',
    });
  });

  it('decodes 30 fps SMPTE timecode', () => {
    const raw = (0xe2 << 8) | 4; // -30 fps, 4 ticks per frame
    expect(decodeDivision(raw)).toEqual({
      type: 'smpte',
      framesPerSecond: -30,
      ticksPerFrame: 4,
      label: '30 fps',
    });
  });
});

describe('readVariableLengthQuantity', () => {
  it('decodes a single-byte VLQ', () => {
    const view = new DataView(new Uint8Array([0x40]).buffer);
    expect(readVariableLengthQuantity(view, 0, 1)).toEqual({ value: 0x40, nextOffset: 1 });
  });

  it('decodes a multi-byte VLQ', () => {
    const view = new DataView(new Uint8Array([0x81, 0x00]).buffer);
    expect(readVariableLengthQuantity(view, 0, 2)).toEqual({ value: 128, nextOffset: 2 });
  });

  it('throws when the VLQ exceeds 4 bytes', () => {
    const view = new DataView(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x7f]).buffer);
    expect(() => readVariableLengthQuantity(view, 0, 5)).toThrow(
      /longer than 4 bytes/
    );
  });

  it('throws when the VLQ runs past the chunk limit', () => {
    const view = new DataView(new Uint8Array([0x81]).buffer);
    expect(() => readVariableLengthQuantity(view, 0, 1)).toThrow(/runs past the end/);
  });
});

describe('formatFileSize', () => {
  it('formats bytes below 1KB', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });
});

describe('isMidiFile', () => {
  it('accepts files with a .mid extension', () => {
    expect(isMidiFile(new File([''], 'song.mid'))).toBe(true);
  });

  it('accepts files with a .midi extension', () => {
    expect(isMidiFile(new File([''], 'song.midi'))).toBe(true);
  });

  it('accepts files reporting an audio/midi MIME type', () => {
    expect(isMidiFile(new File([''], 'song.bin', { type: 'audio/midi' }))).toBe(true);
  });

  it('rejects unrelated files', () => {
    expect(isMidiFile(new File([''], 'notes.txt'))).toBe(false);
  });

  it('rejects a missing file', () => {
    expect(isMidiFile(null)).toBe(false);
  });
});
