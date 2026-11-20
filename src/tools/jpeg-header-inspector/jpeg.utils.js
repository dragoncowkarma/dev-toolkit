/**
 * JPEG segment markers and parser utilities.
 */

export const MARKER_NAMES = {
  0xFFD8: { name: 'SOI', description: 'Start of Image' },
  0xFFD9: { name: 'EOI', description: 'End of Image' },
  0xFFDA: { name: 'SOS', description: 'Start of Scan' },
  0xFFDB: { name: 'DQT', description: 'Define Quantization Table(s)' },
  0xFFC4: { name: 'DHT', description: 'Define Huffman Table(s)' },
  0xFFC0: { name: 'SOF0', description: 'Baseline DCT' },
  0xFFC1: { name: 'SOF1', description: 'Extended Sequential DCT' },
  0xFFC2: { name: 'SOF2', description: 'Progressive DCT' },
  0xFFC3: { name: 'SOF3', description: 'Lossless (Sequential)' },
  0xFFC5: { name: 'SOF5', description: 'Differential Sequential DCT' },
  0xFFC6: { name: 'SOF6', description: 'Differential Progressive DCT' },
  0xFFC7: { name: 'SOF7', description: 'Differential Lossless (Sequential)' },
  0xFFC8: { name: 'JPG', description: 'JPEG Extensions' },
  0xFFC9: { name: 'SOF9', description: 'Extended Sequential DCT (Arithmetic)' },
  0xFFCA: { name: 'SOF10', description: 'Progressive DCT (Arithmetic)' },
  0xFFCB: { name: 'SOF11', description: 'Lossless (Arithmetic)' },
  0xFFCC: { name: 'DAC', description: 'Define Arithmetic Coding' },
  0xFFCD: { name: 'SOF13', description: 'Differential Sequential DCT (Arithmetic)' },
  0xFFCE: { name: 'SOF14', description: 'Differential Progressive DCT (Arithmetic)' },
  0xFFCF: { name: 'SOF15', description: 'Differential Lossless (Arithmetic)' },
  0xFFDC: { name: 'DNL', description: 'Define Number of Lines' },
  0xFFDD: { name: 'DRI', description: 'Define Restart Interval' },
  0xFFDE: { name: 'DHP', description: 'Define Hierarchical Progression' },
  0xFFDF: { name: 'EXP', description: 'Expand Reference Component' },
  0xFFE0: { name: 'APP0', description: 'Application Segment 0' },
  0xFFE1: { name: 'APP1', description: 'Application Segment 1' },
  0xFFE2: { name: 'APP2', description: 'Application Segment 2' },
  0xFFE3: { name: 'APP3', description: 'Application Segment 3' },
  0xFFE4: { name: 'APP4', description: 'Application Segment 4' },
  0xFFE5: { name: 'APP5', description: 'Application Segment 5' },
  0xFFE6: { name: 'APP6', description: 'Application Segment 6' },
  0xFFE7: { name: 'APP7', description: 'Application Segment 7' },
  0xFFE8: { name: 'APP8', description: 'Application Segment 8' },
  0xFFE9: { name: 'APP9', description: 'Application Segment 9' },
  0xFFEA: { name: 'APP10', description: 'Application Segment 10' },
  0xFFEB: { name: 'APP11', description: 'Application Segment 11' },
  0xFFEC: { name: 'APP12', description: 'Application Segment 12' },
  0xFFED: { name: 'APP13', description: 'Application Segment 13' },
  0xFFEE: { name: 'APP14', description: 'Application Segment 14' },
  0xFFEF: { name: 'APP15', description: 'Application Segment 15' },
  0xFFFE: { name: 'COM', description: 'Comment' },
};

/**
 * Checks if a marker is a Start of Frame (SOF) marker.
 * @param {number} marker - 16-bit marker code.
 * @returns {boolean}
 */
export function isSofMarker(marker) {
  return (
    marker >= 0xFFC0 &&
    marker <= 0xFFCF &&
    marker !== 0xFFC4 &&
    marker !== 0xFFC8 &&
    marker !== 0xFFCC
  );
}

/**
 * Checks if a marker has no length field (standalone marker).
 * @param {number} marker - 16-bit marker code.
 * @returns {boolean}
 */
export function isStandaloneMarker(marker) {
  return (
    marker === 0xFFD8 || // SOI
    marker === 0xFFD9 || // EOI
    marker === 0xFF01 || // TEM
    (marker >= 0xFFD0 && marker <= 0xFFD7) // RST0-RST7
  );
}

/**
 * Parses APP0 segment payload (specifically JFIF).
 * @param {DataView} view
 * @param {number} payloadOffset
 * @param {number} payloadLength
 * @returns {{ name: string, description: string, details: object|null }}
 */
function parseApp0(view, payloadOffset, payloadLength) {
  if (payloadLength < 5) {
    return { name: 'APP0', description: 'Application Segment 0', details: null };
  }
  const idBytes = [];
  for (let i = 0; i < 5; i += 1) {
    idBytes.push(view.getUint8(payloadOffset + i));
  }
  const idStr = String.fromCharCode(...idBytes.slice(0, 4));
  if (idStr === 'JFIF' && idBytes[4] === 0x00) {
    if (payloadLength < 14) {
      throw new Error(
        'Truncated APP0/JFIF segment: expected at least 14 payload bytes.',
      );
    }
    const major = view.getUint8(payloadOffset + 5);
    const minor = view.getUint8(payloadOffset + 6);
    const units = view.getUint8(payloadOffset + 7);
    const xDensity = view.getUint16(payloadOffset + 8, false);
    const yDensity = view.getUint16(payloadOffset + 10, false);
    const thumbX = view.getUint8(payloadOffset + 12);
    const thumbY = view.getUint8(payloadOffset + 13);
    const unitLabels = {
      0: 'None (aspect ratio)',
      1: 'Pixels per inch (DPI)',
      2: 'Pixels per cm (DPC)',
    };
    const densityUnitsLabel = unitLabels[units] ?? `Unknown (${units})`;

    return {
      name: 'APP0/JFIF',
      description: 'JFIF Application Segment',
      details: {
        identifier: 'JFIF',
        jfifVersion: `${major}.${String(minor).padStart(2, '0')}`,
        densityUnits: units,
        densityUnitsLabel,
        xDensity,
        yDensity,
        thumbnailWidth: thumbX,
        thumbnailHeight: thumbY,
      },
    };
  }
  if (idStr === 'JFXX' && idBytes[4] === 0x00) {
    return {
      name: 'APP0/JFXX',
      description: 'JFIF Extension Segment',
      details: { identifier: 'JFXX' },
    };
  }
  return { name: 'APP0', description: 'Application Segment 0', details: null };
}

/**
 * Parses SOF segment payload.
 * @param {DataView} view
 * @param {number} payloadOffset
 * @param {number} payloadLength
 * @param {string} markerName
 * @returns {object}
 */
function parseSof(view, payloadOffset, payloadLength, markerName) {
  if (payloadLength < 6) {
    throw new Error(`Truncated ${markerName} segment: missing frame header.`);
  }
  const precision = view.getUint8(payloadOffset);
  const height = view.getUint16(payloadOffset + 1, false);
  const width = view.getUint16(payloadOffset + 3, false);
  const componentCount = view.getUint8(payloadOffset + 5);

  if (payloadLength < 6 + componentCount * 3) {
    throw new Error(
      `Truncated ${markerName} segment: incomplete component descriptors.`,
    );
  }

  const components = [];
  for (let c = 0; c < componentCount; c += 1) {
    const compOffset = payloadOffset + 6 + c * 3;
    const id = view.getUint8(compOffset);
    const factorByte = view.getUint8(compOffset + 1);
    const hSample = factorByte >> 4;
    const vSample = factorByte & 0x0F;
    const qTableId = view.getUint8(compOffset + 2);
    components.push({ id, hSample, vSample, qTableId });
  }

  return {
    precision,
    height,
    width,
    componentCount,
    components,
  };
}

/**
 * Parses a JPEG ArrayBuffer or Uint8Array client-side.
 *
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{ segments: Array<object>, imageInfo: object, segmentCount: number }}
 */
export function parseJpeg(input) {
  if (!input) {
    throw new TypeError('Invalid input: expected ArrayBuffer or Uint8Array.');
  }

  let buffer;
  let byteOffset = 0;
  let byteLength = 0;

  if (input instanceof ArrayBuffer) {
    buffer = input;
    byteOffset = 0;
    byteLength = input.byteLength;
  } else if (ArrayBuffer.isView(input)) {
    buffer = input.buffer;
    byteOffset = input.byteOffset;
    byteLength = input.byteLength;
  } else {
    throw new TypeError('Invalid input: expected ArrayBuffer or Uint8Array.');
  }

  if (byteLength < 2) {
    throw new Error(
      'Invalid JPEG signature: file is too small (expected at least 2 bytes).',
    );
  }

  const view = new DataView(buffer, byteOffset, byteLength);

  const initialMarker = view.getUint16(0, false);
  if (initialMarker !== 0xFFD8) {
    throw new Error(
      'Invalid JPEG signature: missing SOI marker (expected 0xFFD8).',
    );
  }

  const segments = [];
  segments.push({
    marker: 0xFFD8,
    code: '0xFFD8',
    name: 'SOI',
    description: 'Start of Image',
    offset: 0,
    length: 0,
    details: null,
  });

  let offset = 2;

  while (offset < byteLength) {
    if (view.getUint8(offset) !== 0xFF) {
      const actualByte = view.getUint8(offset).toString(16).toUpperCase();
      throw new Error(
        `Expected marker prefix 0xFF at offset ${offset}, found 0x${actualByte}.`,
      );
    }

    const markerStart = offset;
    while (offset < byteLength && view.getUint8(offset) === 0xFF) {
      offset += 1;
    }

    if (offset >= byteLength) {
      throw new Error('Unexpected end of file while reading marker code.');
    }

    const markerByte = view.getUint8(offset);
    offset += 1;

    // Ignore 0x00 byte stuffing if encountered outside scan
    if (markerByte === 0x00) {
      continue;
    }

    const marker = (0xFF << 8) | markerByte;
    const markerHex = `0x${marker.toString(16).toUpperCase().padStart(4, '0')}`;
    const defaultMeta = MARKER_NAMES[marker] ?? {
      name: `0x${markerByte.toString(16).toUpperCase().padStart(2, '0')}`,
      description: 'Unknown Marker',
    };

    if (isStandaloneMarker(marker)) {
      segments.push({
        marker,
        code: markerHex,
        name: defaultMeta.name,
        description: defaultMeta.description,
        offset: markerStart,
        length: 0,
        details: null,
      });

      if (marker === 0xFFD9) {
        break;
      }
      continue;
    }

    if (offset + 2 > byteLength) {
      throw new Error(
        `Truncated segment header for ${defaultMeta.name} (${markerHex}) ` +
        `at offset ${markerStart}.`,
      );
    }

    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2) {
      throw new Error(
        `Invalid marker length ${segmentLength} for ${defaultMeta.name} ` +
        `at offset ${offset}. Minimum segment length is 2.`,
      );
    }

    if (offset + segmentLength > byteLength) {
      throw new Error(
        `Truncated segment for ${defaultMeta.name} (${markerHex}). ` +
        `Expected ${segmentLength} bytes at offset ${offset}, but only ` +
        `${byteLength - offset} bytes available.`,
      );
    }

    const payloadOffset = offset + 2;
    const payloadLength = segmentLength - 2;

    let segmentName = defaultMeta.name;
    let segmentDescription = defaultMeta.description;
    let details = null;

    if (marker === 0xFFE0) {
      const app0Res = parseApp0(view, payloadOffset, payloadLength);
      segmentName = app0Res.name;
      segmentDescription = app0Res.description;
      details = app0Res.details;
    } else if (marker === 0xFFE1) {
      if (payloadLength >= 5) {
        const idBytes = [];
        for (let i = 0; i < 4; i += 1) {
          idBytes.push(view.getUint8(payloadOffset + i));
        }
        if (String.fromCharCode(...idBytes) === 'Exif') {
          segmentName = 'APP1/Exif';
          segmentDescription = 'Exif Metadata Segment';
          details = { identifier: 'Exif' };
        }
      }
    } else if (isSofMarker(marker)) {
      details = parseSof(view, payloadOffset, payloadLength, segmentName);
    } else if (marker === 0xFFDA) {
      // SOS segment
      if (payloadLength >= 1) {
        const count = view.getUint8(payloadOffset);
        details = { componentCount: count };
      }
    } else if (marker === 0xFFFE) {
      // COM comment segment
      try {
        const rawBytes = new Uint8Array(buffer, byteOffset + payloadOffset, payloadLength);
        const text = new TextDecoder('utf-8', { fatal: false }).decode(rawBytes);
        details = { comment: text };
      } catch {
        details = null;
      }
    }

    segments.push({
      marker,
      code: markerHex,
      name: segmentName,
      description: segmentDescription,
      offset: markerStart,
      length: segmentLength,
      details,
    });

    // Advance past this segment
    offset += segmentLength;

    // Requirement: Stop walking at SOS since compressed scan data follows
    if (marker === 0xFFDA) {
      // Search for EOI in remaining bytes
      let eoiOffset = -1;
      for (let i = offset; i < byteLength - 1; i += 1) {
        if (view.getUint8(i) === 0xFF) {
          let next = view.getUint8(i + 1);
          if (next === 0x00) {
            i += 1;
            continue;
          }
          while (next === 0xFF && i + 1 < byteLength - 1) {
            i += 1;
            next = view.getUint8(i + 1);
          }
          if (next === 0xD9) {
            eoiOffset = i;
            break;
          }
        }
      }

      if (eoiOffset !== -1) {
        segments.push({
          marker: 0xFFD9,
          code: '0xFFD9',
          name: 'EOI',
          description: 'End of Image',
          offset: eoiOffset,
          length: 0,
          details: null,
        });
      }
      break;
    }
  }

  // Summarize overall image information
  const sofSeg = segments.find((s) => isSofMarker(s.marker));
  const jfifSeg = segments.find((s) => s.name === 'APP0/JFIF');

  const imageInfo = {
    width: sofSeg?.details?.width ?? null,
    height: sofSeg?.details?.height ?? null,
    precision: sofSeg?.details?.precision ?? null,
    componentCount: sofSeg?.details?.componentCount ?? null,
    jfifVersion: jfifSeg?.details?.jfifVersion ?? null,
    density: jfifSeg?.details
      ? `${jfifSeg.details.xDensity} × ${jfifSeg.details.yDensity} ` +
        `(${jfifSeg.details.densityUnitsLabel})`
      : null,
  };

  return {
    segments,
    imageInfo,
    segmentCount: segments.length,
  };
}

/**
 * Creates a valid minimal sample JPEG ArrayBuffer for testing and preview.
 * @returns {ArrayBuffer}
 */
export function createSampleJpeg() {
  const bytes = [
    // SOI
    0xFF, 0xD8,
    // APP0 (JFIF)
    0xFF, 0xE0, 0x00, 0x10,
    0x4A, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x02, // version 1.02
    0x01, // density units = 1 (DPI)
    0x00, 0x48, // X density = 72
    0x00, 0x48, // Y density = 72
    0x00, 0x00, // thumbnail 0x0
    // DQT
    0xFF, 0xDB, 0x00, 0x43, // length = 67
    0x00, // table 0, 8-bit
    ...Array(64).fill(16),
    // SOF0 (Baseline DCT)
    0xFF, 0xC0, 0x00, 0x11, // length = 17
    0x08, // 8-bit precision
    0x00, 0x40, // height = 64
    0x00, 0x40, // width = 64
    0x03, // 3 components
    0x01, 0x11, 0x00, // Y: id=1, 1x1 sampling, Q table 0
    0x02, 0x11, 0x00, // Cb: id=2, 1x1 sampling, Q table 0
    0x03, 0x11, 0x00, // Cr: id=3, 1x1 sampling, Q table 0
    // DHT
    0xFF, 0xC4, 0x00, 0x1F, // length = 31
    0x00, // class 0 (DC), table 0
    0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01,
    0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B,
    // SOS
    0xFF, 0xDA, 0x00, 0x0C, // length = 12
    0x03, // 3 components
    0x01, 0x00, // comp 1
    0x02, 0x00, // comp 2
    0x03, 0x00, // comp 3
    0x00, 0x3F, 0x00, // spectral 0..63, approx 0
    // EOI
    0xFF, 0xD9,
  ];
  return new Uint8Array(bytes).buffer;
}

/**
 * Reads a File/Blob as an ArrayBuffer client-side.
 * @param {File|Blob} file
 * @returns {Promise<ArrayBuffer>}
 */
export async function readJpegFile(file) {
  if (!file) {
    throw new Error('No file selected.');
  }
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Formats a byte count into a human-readable string.
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
