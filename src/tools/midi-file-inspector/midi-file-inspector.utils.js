const MTHD_SIGNATURE = 'MThd';
const MTRK_SIGNATURE = 'MTrk';
const MIN_HEADER_LENGTH = 6;
const MAX_CHUNKS = 20000;
const MAX_TRACK_EVENTS = 5000;
const MAX_VLQ_BYTES = 4;

const MIDI_FORMAT_LABELS = {
  0: 'Single track',
  1: 'Multiple synchronous tracks',
  2: 'Multiple independent asynchronous tracks',
};

const SMPTE_FPS_LABELS = {
  '-24': '24 fps',
  '-25': '25 fps',
  '-29': '29.97 fps (drop-frame)',
  '-30': '30 fps',
};

/**
 * Formats a byte count into a human-readable string (e.g. "12.3 KB").
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Checks whether a File looks like a Standard MIDI File based on its name or MIME type.
 * @param {File} file - The file to check.
 * @returns {boolean} True when the file is a `.mid`/`.midi` file or reports an `audio/midi` type.
 */
export function isMidiFile(file) {
  if (!file) return false;
  if (file.type === 'audio/midi' || file.type === 'audio/x-midi') return true;
  const name = file.name?.toLowerCase() ?? '';
  return name.endsWith('.mid') || name.endsWith('.midi');
}

/**
 * Reads an ASCII string directly from a DataView.
 * @param {DataView} view - The buffer view to read from.
 * @param {number} offset - The offset of the first character.
 * @param {number} length - The number of characters to read.
 * @returns {string} The decoded ASCII string.
 */
function readAscii(view, offset, length) {
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += String.fromCharCode(view.getUint8(offset + i));
  }
  return result;
}

/**
 * Reads a MIDI variable-length quantity (VLQ) starting at the given offset.
 * @param {DataView} view - The buffer view to read from.
 * @param {number} offset - The offset to start reading at.
 * @param {number} limit - The exclusive upper bound of readable bytes.
 * @returns {{ value: number, nextOffset: number }} The decoded value and the offset after it.
 * @throws {Error} When the VLQ runs past `limit` or exceeds 4 bytes.
 */
export function readVariableLengthQuantity(view, offset, limit) {
  let value = 0;
  let pos = offset;
  for (let i = 0; i < MAX_VLQ_BYTES; i += 1) {
    if (pos >= limit) {
      throw new Error('Variable-length quantity runs past the end of the chunk.');
    }
    const byte = view.getUint8(pos);
    value = (value << 7) | (byte & 0x7f);
    pos += 1;
    if ((byte & 0x80) === 0) {
      return { value, nextOffset: pos };
    }
  }
  throw new Error('Malformed variable-length quantity (longer than 4 bytes).');
}

/**
 * Decodes the 16-bit MThd time division field into TPQN or SMPTE form.
 * @param {number} raw - The raw 16-bit division value.
 * @returns {object} The decoded time division descriptor.
 */
export function decodeDivision(raw) {
  const highByte = (raw >> 8) & 0xff;
  const lowByte = raw & 0xff;
  if (highByte & 0x80) {
    const framesPerSecond = highByte - 256;
    return {
      type: 'smpte',
      framesPerSecond,
      ticksPerFrame: lowByte,
      label: SMPTE_FPS_LABELS[String(framesPerSecond)] ?? `${framesPerSecond} fps`,
    };
  }
  return {
    type: 'tpqn',
    ticksPerQuarterNote: raw & 0x7fff,
  };
}

/**
 * Applies a decoded MTrk meta event to a track info accumulator.
 * @param {object} info - The track info object being filled in.
 * @param {DataView} view - The buffer view to read event data from.
 * @param {number} metaType - The meta event type byte.
 * @param {number} offset - The offset of the meta event's data.
 * @param {number} length - The byte length of the meta event's data.
 */
function applyMetaEvent(info, view, metaType, offset, length) {
  if (metaType === 0x03) {
    info.trackName = readAscii(view, offset, length);
  } else if (metaType === 0x04) {
    info.instrumentName = readAscii(view, offset, length);
  } else if (metaType === 0x51 && length >= 3) {
    const microsecondsPerQuarter =
      (view.getUint8(offset) << 16) |
      (view.getUint8(offset + 1) << 8) |
      view.getUint8(offset + 2);
    info.tempoMicrosecondsPerQuarter = microsecondsPerQuarter;
    info.tempoBpm =
      microsecondsPerQuarter > 0
        ? Math.round((60000000 / microsecondsPerQuarter) * 100) / 100
        : null;
  } else if (metaType === 0x58 && length >= 4) {
    info.timeSignature = {
      numerator: view.getUint8(offset),
      denominator: 2 ** view.getUint8(offset + 1),
      clocksPerClick: view.getUint8(offset + 2),
      notated32ndNotesPerBeat: view.getUint8(offset + 3),
    };
  }
}

/**
 * Performs a bounded scan of an MTrk chunk's events to extract high-level metadata.
 *
 * Tolerates running status, SysEx events, and arbitrary channel voice messages. Any
 * malformed data (bad VLQs, unsupported status bytes) stops the scan and is reported
 * via `info.malformed` instead of throwing.
 *
 * @param {DataView} view - The buffer view containing the track payload.
 * @param {number} start - The offset of the first event.
 * @param {number} end - The exclusive end offset of the available track payload.
 * @returns {object} A summary of track metadata discovered during the scan.
 */
function scanTrackEvents(view, start, end) {
  const info = {
    trackName: null,
    instrumentName: null,
    tempoMicrosecondsPerQuarter: null,
    tempoBpm: null,
    timeSignature: null,
    endOfTrack: false,
    eventsScanned: 0,
    truncated: false,
    eventCapReached: false,
    malformed: null,
  };

  let pos = start;
  let runningStatus = null;

  try {
    while (pos < end && info.eventsScanned < MAX_TRACK_EVENTS) {
      const delta = readVariableLengthQuantity(view, pos, end);
      pos = delta.nextOffset;
      if (pos >= end) {
        info.truncated = true;
        break;
      }

      let statusByte = view.getUint8(pos);
      if (statusByte & 0x80) {
        pos += 1;
        if (statusByte < 0xf0) {
          runningStatus = statusByte;
        } else {
          runningStatus = null;
        }
      } else {
        if (runningStatus === null) {
          throw new Error('Running status byte used before any status byte was set.');
        }
        statusByte = runningStatus;
      }

      info.eventsScanned += 1;

      if (statusByte === 0xff) {
        if (pos >= end) throw new Error('Truncated meta event.');
        const metaType = view.getUint8(pos);
        pos += 1;
        const metaLength = readVariableLengthQuantity(view, pos, end);
        pos = metaLength.nextOffset;
        if (pos + metaLength.value > end) {
          info.truncated = true;
          break;
        }
        applyMetaEvent(info, view, metaType, pos, metaLength.value);
        pos += metaLength.value;
        if (metaType === 0x2f) {
          info.endOfTrack = true;
          break;
        }
      } else if (statusByte === 0xf0 || statusByte === 0xf7) {
        const sysexLength = readVariableLengthQuantity(view, pos, end);
        pos = sysexLength.nextOffset;
        if (pos + sysexLength.value > end) {
          info.truncated = true;
          break;
        }
        pos += sysexLength.value;
      } else if (statusByte >= 0x80 && statusByte <= 0xef) {
        const messageType = statusByte & 0xf0;
        const bytesToSkip = messageType === 0xc0 || messageType === 0xd0 ? 1 : 2;
        if (pos + bytesToSkip > end) {
          info.truncated = true;
          break;
        }
        pos += bytesToSkip;
      } else {
        throw new Error(`Unsupported status byte 0x${statusByte.toString(16)}.`);
      }
    }
  } catch (err) {
    info.malformed = err.message;
  }

  if (!info.endOfTrack && !info.malformed && info.eventsScanned >= MAX_TRACK_EVENTS) {
    info.eventCapReached = true;
    info.truncated = true;
  }

  return info;
}

/**
 * Parses a Standard MIDI File (SMF) from a raw ArrayBuffer.
 *
 * Reads the `MThd` header chunk and walks every subsequent top-level chunk (typically
 * `MTrk` track chunks), extracting high-level metadata. Malformed or truncated input
 * never throws; it is instead reported through the returned `warnings`/`errors` arrays
 * or per-chunk `complete`/`trackInfo.malformed` fields.
 *
 * @param {ArrayBuffer} buffer - The raw bytes of the MIDI file.
 * @returns {{
 *   header: object|null,
 *   chunks: object[],
 *   warnings: string[],
 *   errors: string[],
 * }} The parsed structure, or `header: null` with `errors` populated on failure.
 */
export function parseMidiFile(buffer) {
  const view = new DataView(buffer);
  const totalLength = buffer.byteLength;
  const warnings = [];
  const errors = [];
  const chunks = [];

  if (totalLength < 8) {
    errors.push('File is too small to contain a valid MThd header chunk.');
    return { header: null, chunks, warnings, errors };
  }

  const magic = readAscii(view, 0, 4);
  if (magic !== MTHD_SIGNATURE) {
    errors.push(`Invalid signature: expected "MThd" but found "${magic}".`);
    return { header: null, chunks, warnings, errors };
  }

  const headerLength = view.getUint32(4, false);
  const headerDataStart = 8;
  const headerDataEnd = headerDataStart + headerLength;

  if (headerLength < MIN_HEADER_LENGTH) {
    errors.push(
      `MThd length ${headerLength} is smaller than the required ${MIN_HEADER_LENGTH} bytes.`
    );
    return { header: null, chunks, warnings, errors };
  }

  if (headerDataEnd > totalLength) {
    errors.push(`Truncated MThd chunk: declared length ${headerLength} exceeds the file size.`);
    return { header: null, chunks, warnings, errors };
  }

  if (headerLength > MIN_HEADER_LENGTH) {
    warnings.push(
      `MThd declares an extended header length of ${headerLength} bytes ` +
        `(standard is ${MIN_HEADER_LENGTH}); extra bytes are preserved but not interpreted.`
    );
  }

  const format = view.getUint16(headerDataStart, false);
  const numTracks = view.getUint16(headerDataStart + 2, false);
  const divisionRaw = view.getUint16(headerDataStart + 4, false);

  const header = {
    length: headerLength,
    format,
    formatLabel: MIDI_FORMAT_LABELS[format] ?? `Unknown (${format})`,
    numTracks,
    division: decodeDivision(divisionRaw),
  };

  chunks.push({
    id: MTHD_SIGNATURE,
    offset: 0,
    declaredLength: headerLength,
    complete: true,
    type: 'header',
  });

  let offset = headerDataEnd;
  let chunkCount = 0;
  let stoppedOnTruncation = false;

  while (offset + 8 <= totalLength && chunkCount < MAX_CHUNKS) {
    chunkCount += 1;
    const id = readAscii(view, offset, 4);
    const declaredLength = view.getUint32(offset + 4, false);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + declaredLength;
    const complete = payloadEnd <= totalLength;
    const availableEnd = complete ? payloadEnd : totalLength;

    const chunk = {
      id,
      offset,
      declaredLength,
      complete,
      type: id === MTRK_SIGNATURE ? 'track' : 'unknown',
    };

    if (id === MTRK_SIGNATURE) {
      chunk.trackInfo = scanTrackEvents(view, payloadStart, availableEnd);
    }

    chunks.push(chunk);

    if (!complete) {
      warnings.push(
        `Chunk "${id}" at offset ${offset} is truncated: declared ${declaredLength} bytes ` +
          `but only ${availableEnd - payloadStart} available.`
      );
      stoppedOnTruncation = true;
      break;
    }

    offset = payloadEnd;
  }

  if (chunkCount >= MAX_CHUNKS) {
    warnings.push(`Stopped scanning after ${MAX_CHUNKS} chunks to avoid excessive processing.`);
  }

  const trailingBytes = totalLength - offset;
  if (!stoppedOnTruncation && trailingBytes > 0 && trailingBytes < 8) {
    warnings.push(
      `${trailingBytes} trailing byte(s) after the last chunk do not form a complete chunk header.`
    );
  }

  return { header, chunks, warnings, errors };
}
