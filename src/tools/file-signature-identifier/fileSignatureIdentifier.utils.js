const HEADER_BYTES_TO_READ = 512;

const signatures = [
  {
    name: 'PNG image',
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    description: 'Portable Network Graphics image.',
  },
  {
    name: 'JPEG image',
    bytes: [0xff, 0xd8, 0xff],
    description: 'JPEG compressed image.',
  },
  {
    name: 'GIF image',
    bytes: [0x47, 0x49, 0x46, 0x38],
    description: 'Graphics Interchange Format image.',
  },
  {
    name: 'PDF document',
    bytes: [0x25, 0x50, 0x44, 0x46, 0x2d],
    description: 'Portable Document Format document.',
  },
  {
    name: '7z archive',
    bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c],
    description: '7-Zip compressed archive.',
  },
  {
    name: 'RAR archive (v5)',
    bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00],
    description: 'RAR version 5 compressed archive.',
  },
  {
    name: 'RAR archive (v4)',
    bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00],
    description: 'RAR version 4 compressed archive.',
  },
  {
    name: 'GZIP archive',
    bytes: [0x1f, 0x8b, 0x08],
    description: 'GZIP compressed data.',
  },
  {
    name: 'BZIP2 archive',
    bytes: [0x42, 0x5a, 0x68],
    description: 'BZIP2 compressed data.',
  },
  {
    name: 'XZ archive',
    bytes: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00],
    description: 'XZ compressed data.',
  },
  {
    name: 'Zstandard archive',
    bytes: [0x28, 0xb5, 0x2f, 0xfd],
    description: 'Zstandard compressed data.',
  },
  {
    name: 'ELF executable',
    bytes: [0x7f, 0x45, 0x4c, 0x46],
    description: 'Executable and Linkable Format binary.',
  },
  {
    name: 'WebAssembly binary',
    bytes: [0x00, 0x61, 0x73, 0x6d],
    description: 'WebAssembly module.',
  },
  {
    name: 'SQLite database',
    bytes: [
      0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66,
      0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00,
    ],
    description: 'SQLite version 3 database.',
  },
  {
    name: 'FLAC audio',
    bytes: [0x66, 0x4c, 0x61, 0x43],
    description: 'Free Lossless Audio Codec audio.',
  },
  {
    name: 'Ogg media',
    bytes: [0x4f, 0x67, 0x67, 0x53],
    description: 'Ogg container audio or video.',
  },
  {
    name: 'MP3 audio (ID3)',
    bytes: [0x49, 0x44, 0x33],
    description: 'MP3 audio with an ID3 metadata tag.',
  },
  {
    name: 'BMP image',
    bytes: [0x42, 0x4d],
    description: 'Windows bitmap image.',
  },
  {
    name: 'ICO image',
    bytes: [0x00, 0x00, 0x01, 0x00],
    description: 'Windows icon image.',
  },
  {
    name: 'TIFF image (little-endian)',
    bytes: [0x49, 0x49, 0x2a, 0x00],
    description: 'Tagged Image File Format image.',
  },
  {
    name: 'TIFF image (big-endian)',
    bytes: [0x4d, 0x4d, 0x00, 0x2a],
    description: 'Tagged Image File Format image.',
  },
  {
    name: 'Mach-O binary (32-bit)',
    bytes: [0xfe, 0xed, 0xfa, 0xce],
    description: 'Mach-O 32-bit executable binary.',
  },
  {
    name: 'Mach-O binary (64-bit)',
    bytes: [0xfe, 0xed, 0xfa, 0xcf],
    description: 'Mach-O 64-bit executable binary.',
  },
  {
    name: 'Mach-O universal binary',
    bytes: [0xca, 0xfe, 0xba, 0xbe],
    description: 'Mach-O universal (fat) binary.',
  },
  {
    name: 'ZIP archive',
    bytes: [0x50, 0x4b, 0x03, 0x04],
    description: 'ZIP archive, including DOCX, XLSX, JAR, and other ZIP-based formats.',
  },
];

function bytesMatchAt(bytes, signature, offset) {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function resultFromSignature(signature, offset) {
  return {
    ...signature,
    offset,
    hex: toHex(signature.bytes),
  };
}

function isPeExecutable(bytes) {
  if (!bytesMatchAt(bytes, [0x4d, 0x5a], 0) || bytes.length < 0x40) return false;
  const peOffset = bytes[0x3c] | (bytes[0x3d] << 8) | (bytes[0x3e] << 16) | (bytes[0x3f] << 24);
  const hasPeSignature = bytesMatchAt(bytes, [0x50, 0x45, 0, 0], peOffset);
  return peOffset >= 0 && peOffset + 4 <= bytes.length && hasPeSignature;
}

/**
 * Identifies a file format from a leading byte sequence without inferring a type from its name.
 *
 * @param {Uint8Array} bytes File header bytes.
 * @returns {{name: string, bytes: number[], description: string, offset: number, hex: string}|null}
 */
export function identifyFileSignature(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return null;

  if (isPeExecutable(bytes)) {
    return resultFromSignature({
      name: 'PE executable',
      bytes: [0x4d, 0x5a],
      description: 'Windows Portable Executable binary.',
    }, 0);
  }

  if (bytesMatchAt(bytes, [0x52, 0x49, 0x46, 0x46], 0) && bytes.length >= 12) {
    if (bytesMatchAt(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
      return resultFromSignature(
        {
          name: 'WEBP image',
          bytes: [0x57, 0x45, 0x42, 0x50],
          description: 'WebP image in a RIFF container.',
        },
        8,
      );
    }
    if (bytesMatchAt(bytes, [0x57, 0x41, 0x56, 0x45], 8)) {
      return resultFromSignature(
        {
          name: 'WAV audio',
          bytes: [0x57, 0x41, 0x56, 0x45],
          description: 'WAV audio in a RIFF container.',
        },
        8,
      );
    }
  }

  if (bytesMatchAt(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
    const isQuickTime = bytesMatchAt(bytes, [0x71, 0x74, 0x20, 0x20], 8);
    return resultFromSignature(
      {
        name: isQuickTime ? 'MOV video' : 'MP4 media',
        bytes: [0x66, 0x74, 0x79, 0x70],
        description: isQuickTime
          ? 'QuickTime movie in an ISO base media file container.'
          : 'MP4-compatible media in an ISO base media file container.',
      },
      4
    );
  }

  for (const signature of signatures) {
    if (bytesMatchAt(bytes, signature.bytes, 0)) return resultFromSignature(signature, 0);
  }

  return null;
}

/**
 * Reads only the header bytes needed for local file-signature matching.
 *
 * @param {File|Blob} file File selected in the browser.
 * @returns {Promise<Uint8Array>} Up to 512 leading bytes from the file.
 */
export async function readFileHeader(file) {
  if (!(file instanceof Blob)) {
    throw new TypeError('A file is required.');
  }
  return new Uint8Array(await file.slice(0, HEADER_BYTES_TO_READ).arrayBuffer());
}

/**
 * Formats a byte count for the file details display.
 *
 * @param {number} bytes Byte count.
 * @returns {string} Human-readable file size.
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
