const DDS_MAGIC = 'DDS ';
const DDS_HEADER_SIZE = 128;
const DDS_DX10_HEADER_SIZE = 20;

const DXGI_FORMATS = {
  2: 'R32G32B32A32_FLOAT',
  10: 'R16G16B16A16_FLOAT',
  16: 'R32G32_FLOAT',
  28: 'R8G8B8A8_UNORM',
  29: 'R8G8B8A8_UNORM_SRGB',
  41: 'R32_FLOAT',
  49: 'R8G8_UNORM',
  54: 'R16_FLOAT',
  61: 'R8_UNORM',
  71: 'BC1_UNORM',
  72: 'BC1_UNORM_SRGB',
  74: 'BC2_UNORM',
  75: 'BC2_UNORM_SRGB',
  77: 'BC3_UNORM',
  78: 'BC3_UNORM_SRGB',
  80: 'BC4_UNORM',
  83: 'BC5_UNORM',
  87: 'B8G8R8A8_UNORM',
  91: 'B8G8R8A8_UNORM_SRGB',
  95: 'BC6H_UF16',
  98: 'BC7_UNORM',
  99: 'BC7_UNORM_SRGB',
};

function toDataView(input) {
  if (input instanceof ArrayBuffer) {
    return new DataView(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new DataView(input.buffer, input.byteOffset, input.byteLength);
  }
  return null;
}

function fourCcFromValue(value) {
  return String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function formatHex(value) {
  return `0x${value.toString(16).toUpperCase().padStart(8, '0')}`;
}

function parsePixelFormat(view) {
  const fourCcValue = view.getUint32(84, true);
  return {
    size: view.getUint32(76, true),
    flags: view.getUint32(80, true),
    fourCC: { hex: formatHex(fourCcValue), ascii: fourCcFromValue(fourCcValue) },
    rgbBitCount: view.getUint32(88, true),
    redMask: view.getUint32(92, true),
    greenMask: view.getUint32(96, true),
    blueMask: view.getUint32(100, true),
    alphaMask: view.getUint32(104, true),
  };
}

/**
 * Parses the fixed DDS header and its optional DirectX 10 extension without throwing.
 *
 * @param {ArrayBuffer|ArrayBufferView} input - DDS file bytes.
 * @returns {{ok: true, header: object}|{ok: false, error: string}}
 */
export function parseDdsHeader(input) {
  const view = toDataView(input);
  if (!view) {
    return { ok: false, error: 'DDS data must be an ArrayBuffer or typed array.' };
  }
  if (view.byteLength < DDS_HEADER_SIZE) {
    return { ok: false, error: 'DDS data is truncated; a complete header needs 128 bytes.' };
  }

  const magic = String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset, 4));
  if (magic !== DDS_MAGIC) {
    return { ok: false, error: 'Invalid DDS magic. Expected "DDS ".' };
  }

  const pixelFormat = parsePixelFormat(view);
  const header = {
    magic,
    size: view.getUint32(4, true),
    flags: view.getUint32(8, true),
    height: view.getUint32(12, true),
    width: view.getUint32(16, true),
    pitchOrLinearSize: view.getUint32(20, true),
    depth: view.getUint32(24, true),
    mipMapCount: view.getUint32(28, true),
    pixelFormat,
    caps: view.getUint32(108, true),
    caps2: view.getUint32(112, true),
    caps3: view.getUint32(116, true),
    caps4: view.getUint32(120, true),
  };

  if (pixelFormat.fourCC.ascii === 'DX10') {
    if (view.byteLength < DDS_HEADER_SIZE + DDS_DX10_HEADER_SIZE) {
      return { ok: false, error: 'DDS DX10 header is truncated; 148 bytes are required.' };
    }
    const dxgiFormat = view.getUint32(128, true);
    header.dx10 = {
      dxgiFormat,
      dxgiFormatName: DXGI_FORMATS[dxgiFormat] ?? `Unknown DXGI format (${dxgiFormat})`,
      resourceDimension: view.getUint32(132, true),
      miscFlag: view.getUint32(136, true),
      arraySize: view.getUint32(140, true),
      miscFlags2: view.getUint32(144, true),
    };
  }

  return { ok: true, header };
}

/**
 * Converts pasted hexadecimal bytes into a Uint8Array.
 *
 * @param {string} text - Whitespace-separated or continuous hexadecimal bytes.
 * @returns {{ok: true, bytes: Uint8Array}|{ok: false, error: string}}
 */
export function parseHexBytes(text) {
  const normalized = text.replace(/0x/gi, '').replace(/[\s,:-]/g, '');
  if (!normalized) {
    return { ok: false, error: 'Enter hexadecimal DDS bytes.' };
  }
  if (!/^[\da-f]+$/i.test(normalized) || normalized.length % 2 !== 0) {
    return { ok: false, error: 'Hex input must contain complete hexadecimal byte pairs.' };
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return { ok: true, bytes };
}

/**
 * Formats bytes as a compact, offset-labeled hexadecimal dump.
 *
 * @param {ArrayBuffer|ArrayBufferView} input - Bytes to display.
 * @returns {string} The formatted dump, or an empty string for unsupported input.
 */
export function formatHexDump(input) {
  const view = toDataView(input);
  if (!view) return '';
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const lines = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const row = bytes.slice(offset, offset + 16);
    const hex = Array.from(row, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
    lines.push(`${offset.toString(16).padStart(6, '0')}: ${hex}`);
  }
  return lines.join('\n');
}
