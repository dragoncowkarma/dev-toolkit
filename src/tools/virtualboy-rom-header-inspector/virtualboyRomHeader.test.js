import { describe, expect, it, vi } from 'vitest';
import {
  HEADER_OFFSET_FROM_END,
  MAX_ROM_SIZE,
  MIN_ROM_SIZE,
  decodeGameCode,
  decodeGameTitle,
  decodeMakerCode,
  decodeReservedBytes,
  decodeVersionByte,
  isPowerOfTwo,
  parseVirtualBoyRomHeader,
  readFileAsBytes,
  validateRomSize,
} from './virtualboyRomHeader.utils.js';

/**
 * Builds a synthetic Virtual Boy ROM buffer for tests.
 *
 * @param {object} [options]
 * @param {number} [options.size]
 * @param {string|number[]} [options.title]
 * @param {number[]} [options.reserved]
 * @param {string|number[]} [options.maker]
 * @param {string|number[]} [options.gameCode]
 * @param {number} [options.version]
 * @param {number} [options.vectorFill]
 * @param {Record<number, number[]>} [options.vectors]
 * @returns {Uint8Array}
 */
function buildMockRom({
  size = MIN_ROM_SIZE,
  title = 'MARIO CLASH',
  reserved = [0x00, 0x00, 0x00, 0x00, 0x00],
  maker = '01',
  gameCode = 'VMCE',
  version = 0x00,
  vectorFill = 0x00,
  vectors = {
    4: [0x28, 0x00, 0x00, 0x00], // VIP interrupt stub
    31: [0x28, 0x00, 0x00, 0x10], // Reset vector stub
  },
} = {}) {
  const rom = new Uint8Array(size);
  const headerOffset = size - HEADER_OFFSET_FROM_END;

  // Fill title with space padding first, then write bytes.
  rom.fill(0x20, headerOffset, headerOffset + 20);
  const titleBytes = typeof title === 'string'
    ? Array.from(title, (ch) => ch.charCodeAt(0))
    : title;
  rom.set(titleBytes.slice(0, 20), headerOffset);

  rom.set(reserved.slice(0, 5), headerOffset + 0x14);

  const makerBytes = typeof maker === 'string'
    ? Array.from(maker, (ch) => ch.charCodeAt(0))
    : maker;
  rom.set(makerBytes.slice(0, 2), headerOffset + 0x19);

  const codeBytes = typeof gameCode === 'string'
    ? Array.from(gameCode, (ch) => ch.charCodeAt(0))
    : gameCode;
  rom.set(codeBytes.slice(0, 4), headerOffset + 0x1b);

  rom[headerOffset + 0x1f] = version;

  const vectorOffset = size - 0x200;
  rom.fill(vectorFill, vectorOffset, size);
  Object.entries(vectors).forEach(([slotIndex, slotData]) => {
    const start = vectorOffset + Number(slotIndex) * 16;
    rom.set(slotData.slice(0, 16), start);
  });

  return rom;
}

describe('isPowerOfTwo', () => {
  it('accepts valid Virtual Boy ROM sizes', () => {
    expect(isPowerOfTwo(16 * 1024)).toBe(true);
    expect(isPowerOfTwo(1024 * 1024)).toBe(true);
    expect(isPowerOfTwo(16 * 1024 * 1024)).toBe(true);
  });

  it('rejects zero, negative, and non power-of-two numbers', () => {
    expect(isPowerOfTwo(0)).toBe(false);
    expect(isPowerOfTwo(-16384)).toBe(false);
    expect(isPowerOfTwo(20000)).toBe(false);
    expect(isPowerOfTwo(16384 + 544)).toBe(false);
  });
});

describe('parseVirtualBoyRomHeader', () => {
  it('parses a valid Virtual Boy ROM header at size - 0x220', () => {
    const rom = buildMockRom({
      size: 64 * 1024,
      title: 'MARIO CLASH',
      maker: '01',
      gameCode: 'VMCE',
      version: 0x01,
    });

    const result = parseVirtualBoyRomHeader(rom);

    expect(result.romSize).toBe(65536);
    expect(result.romSizeLabel).toBe('64 KiB (65,536 bytes)');
    expect(result.headerOffset).toBe(65536 - 0x220);
    expect(result.headerOffsetHex).toBe('0x00FDE0');
    expect(result.title.value).toBe('MARIO CLASH');
    expect(result.title.encoding).toBe('ASCII');
    expect(result.title.valid).toBe(true);
    expect(result.reserved.allZero).toBe(true);
    expect(result.reserved.rawHex).toBe('00 00 00 00 00');
    expect(result.maker.code).toBe('01');
    expect(result.maker.name).toBe('Nintendo');
    expect(result.maker.display).toBe('01 — Nintendo');
    expect(result.gameCode.code).toBe('VMCE');
    expect(result.gameCode.system).toBe('Virtual Boy');
    expect(result.gameCode.gameId).toBe('MC');
    expect(result.gameCode.region).toBe('North America');
    expect(result.version.display).toBe('1.1 (0x01)');
    expect(result.vectorTable.present).toBe(true);
    expect(result.vectorTable.hasResetVector).toBe(true);
    expect(result.vectorTable.status).toBe('Present');
    expect(result.vectorTable.populatedSlots).toBe(2);
    expect(result.vectorTable.activeNamedVectors).toEqual([
      { name: 'VIP Interrupt (INT4)', address: '0xFFFFFE40' },
      { name: 'Reset Vector', address: '0xFFFFFFF0' },
    ]);
  });

  it('accepts an ArrayBuffer directly', () => {
    const rom = buildMockRom();
    const result = parseVirtualBoyRomHeader(rom.buffer);
    expect(result.title.value).toBe('MARIO CLASH');
  });

  it('rejects a truncated or smaller-than-16-KiB file', () => {
    expect(() => parseVirtualBoyRomHeader(new Uint8Array(0))).toThrow(/too small/i);
    expect(() => parseVirtualBoyRomHeader(new Uint8Array(544))).toThrow(/too small/i);
    expect(() => parseVirtualBoyRomHeader(new Uint8Array(MIN_ROM_SIZE - 1))).toThrow(
      /too small/i,
    );
  });

  it('rejects a non power-of-two ROM size', () => {
    expect(() => parseVirtualBoyRomHeader(new Uint8Array(20000))).toThrow(/power of two/i);
    expect(() => parseVirtualBoyRomHeader(new Uint8Array(MIN_ROM_SIZE + 512))).toThrow(
      /power of two/i,
    );
  });

  it('rejects ROMs larger than 16 MiB', () => {
    const oversized = new Uint8Array(MAX_ROM_SIZE * 2);
    expect(() => parseVirtualBoyRomHeader(oversized)).toThrow(/too large/i);
  });

  it('decodes valid non-ASCII Shift-JIS title bytes', () => {
    // Shift-JIS for "マリオ" (0x83 0x7D, 0x83 0x8A, 0x83 0x49)
    const shiftJisMario = [0x83, 0x7d, 0x83, 0x8a, 0x83, 0x49];
    const rom = buildMockRom({ title: shiftJisMario, gameCode: 'VMCJ' });

    const result = parseVirtualBoyRomHeader(rom);
    expect(result.title.valid).toBe(true);
    expect(result.title.value).toBe('マリオ');
    expect(result.title.display).toBe('マリオ');
    expect(result.title.encoding).toBe('Shift-JIS');
    expect(result.gameCode.region).toBe('Japan');
  });

  it('decodes half-width Shift-JIS katakana title bytes', () => {
    // Shift-JIS half-width katakana "ﾊﾞｰﾁｬﾙ"
    const halfWidth = [0xca, 0xde, 0xb0, 0xc1, 0xac, 0xd9];
    const rom = buildMockRom({ title: halfWidth });

    const result = parseVirtualBoyRomHeader(rom);
    expect(result.title.valid).toBe(true);
    expect(result.title.value).toBe('ﾊﾞｰﾁｬﾙ');
    expect(result.title.encoding).toBe('Shift-JIS');
  });

  it('marks invalid non-ASCII title bytes as Unknown instead of guessing', () => {
    const invalidTitle = [0xff, 0xfe, 0x80, 0x82];
    const rom = buildMockRom({ title: invalidTitle });

    const result = parseVirtualBoyRomHeader(rom);
    expect(result.title.valid).toBe(false);
    expect(result.title.value).toBeNull();
    expect(result.title.display).toBe('Unknown');
    expect(result.title.encoding).toBe('Unknown');
    expect(result.title.rawHex.startsWith('FF FE 80 82')).toBe(true);
  });

  it('reports blank interrupt vector tables filled with 0x00 or 0xFF as not detected', () => {
    const zeroTableRom = buildMockRom({ vectorFill: 0x00, vectors: {} });
    const ffTableRom = buildMockRom({ vectorFill: 0xff, vectors: {} });

    expect(parseVirtualBoyRomHeader(zeroTableRom).vectorTable.present).toBe(false);
    expect(parseVirtualBoyRomHeader(zeroTableRom).vectorTable.status).toBe(
      'Not detected (blank)',
    );
    expect(parseVirtualBoyRomHeader(ffTableRom).vectorTable.present).toBe(false);
    expect(parseVirtualBoyRomHeader(ffTableRom).vectorTable.hasResetVector).toBe(false);
  });

  it('reports partial interrupt vector table when Reset vector is blank', () => {
    const partialRom = buildMockRom({
      vectorFill: 0x00,
      vectors: { 0: [0x28, 0x00, 0x00, 0x01] },
    });

    const { vectorTable } = parseVirtualBoyRomHeader(partialRom);
    expect(vectorTable.present).toBe(true);
    expect(vectorTable.hasResetVector).toBe(false);
    expect(vectorTable.status).toBe('Partial (Reset vector blank)');
  });
});

describe('field decoders for unknown and invalid values', () => {
  it('returns Unknown for blank or control-byte titles', () => {
    const blank = decodeGameTitle(new Uint8Array(20).fill(0x20));
    expect(blank.display).toBe('Unknown');
    expect(blank.valid).toBe(false);

    const withControl = decodeGameTitle(new Uint8Array([0x41, 0x07, 0x42, 0x00]));
    expect(withControl.display).toBe('Unknown');
    expect(withControl.valid).toBe(false);
  });

  it('flags non-zero reserved bytes', () => {
    const result = decodeReservedBytes(new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x00]));
    expect(result.allZero).toBe(false);
    expect(result.status).toBe('Non-zero');
  });

  it('decodes cited maker codes and leaves unlisted or invalid codes as Unknown', () => {
    const nintendo = decodeMakerCode(new Uint8Array([0x30, 0x31])); // 01
    expect(nintendo.valid).toBe(true);
    expect(nintendo.code).toBe('01');
    expect(nintendo.name).toBe('Nintendo');
    expect(nintendo.display).toBe('01 — Nintendo');

    const hudson = decodeMakerCode(new Uint8Array([0x31, 0x38])); // 18
    expect(hudson.valid).toBe(true);
    expect(hudson.code).toBe('18');
    expect(hudson.name).toBe('Hudson Soft');
    expect(hudson.display).toBe('18 — Hudson Soft');

    const kemco = decodeMakerCode(new Uint8Array([0x32, 0x38])); // 28
    expect(kemco.valid).toBe(true);
    expect(kemco.code).toBe('28');
    expect(kemco.name).toBe('Kemco');
    expect(kemco.display).toBe('28 — Kemco');

    const unlistedCode = decodeMakerCode(new Uint8Array([0x38, 0x42])); // 8B
    expect(unlistedCode.valid).toBe(true);
    expect(unlistedCode.code).toBe('8B');
    expect(unlistedCode.name).toBe('Unknown');
    expect(unlistedCode.display).toBe('8B (Unknown)');

    const unknownCode = decodeMakerCode(new Uint8Array([0x5a, 0x5a])); // ZZ
    expect(unknownCode.valid).toBe(true);
    expect(unknownCode.code).toBe('ZZ');
    expect(unknownCode.name).toBe('Unknown');
    expect(unknownCode.display).toBe('ZZ (Unknown)');

    const invalidBytes = decodeMakerCode(new Uint8Array([0xff, 0x00]));
    expect(invalidBytes.valid).toBe(false);
    expect(invalidBytes.display).toBe('Unknown');
  });

  it('handles unknown region/prefix and invalid game codes without guessing', () => {
    const unknownMeta = decodeGameCode(new Uint8Array([0x58, 0x41, 0x42, 0x5a])); // XABZ
    expect(unknownMeta.valid).toBe(true);
    expect(unknownMeta.code).toBe('XABZ');
    expect(unknownMeta.system).toBe('Unknown');
    expect(unknownMeta.region).toBe('Unknown');

    const invalidBytes = decodeGameCode(new Uint8Array([0x00, 0xff, 0x20, 0x7f]));
    expect(invalidBytes.valid).toBe(false);
    expect(invalidBytes.display).toBe('Unknown');
    expect(invalidBytes.region).toBe('Unknown');
  });

  it('formats version bytes with revision and hex', () => {
    expect(decodeVersionByte(0x00).display).toBe('1.0 (0x00)');
    expect(decodeVersionByte(0x02).display).toBe('1.2 (0x02)');
  });
});

describe('validateRomSize', () => {
  it('accepts valid power-of-two ROM sizes within bounds', () => {
    expect(() => validateRomSize(MIN_ROM_SIZE)).not.toThrow();
    expect(() => validateRomSize(1024 * 1024)).not.toThrow();
    expect(() => validateRomSize(MAX_ROM_SIZE)).not.toThrow();
  });

  it('rejects sizes that are too small, too large, or not a power of two', () => {
    expect(() => validateRomSize(MIN_ROM_SIZE - 1)).toThrow(/too small/i);
    expect(() => validateRomSize(MAX_ROM_SIZE + 1)).toThrow(/too large/i);
    expect(() => validateRomSize(20000)).toThrow(/power of two/i);
  });
});

describe('readFileAsBytes', () => {
  it('reads a File into a Uint8Array', async () => {
    const file = new File([new Uint8Array([0x56, 0x42])], 'test.vb');
    const bytes = await readFileAsBytes(file);
    expect(Array.from(bytes)).toEqual([0x56, 0x42]);
  });

  it('rejects when FileReader encounters an error', async () => {
    const failingReader = {
      readAsArrayBuffer: vi.fn(function readAsArrayBuffer() {
        this.onerror(new Error('io error'));
      }),
    };
    const OriginalFileReader = global.FileReader;
    global.FileReader = vi.fn(function FileReader() {
      return failingReader;
    });

    try {
      await expect(readFileAsBytes(new File(['x'], 'bad.vb'))).rejects.toThrow(
        'Failed to read the selected ROM file.',
      );
    } finally {
      global.FileReader = OriginalFileReader;
    }
  });
});

describe('tail-only parsing', () => {
  it('matches full-ROM parsing with absolute offsets for min and max sizes', () => {
    for (const size of [MIN_ROM_SIZE, 16 * 1024 * 1024]) {
      const rom = buildMockRom({ size, title: 'TAIL TEST' });
      const full = parseVirtualBoyRomHeader(rom);
      const tail = parseVirtualBoyRomHeader(rom.slice(size - 0x220), size);
      expect(tail).toEqual(full);
      expect(tail.headerOffset).toBe(size - 0x220);
      expect(tail.vectorTable.offset).toBe(size - 0x200);
    }
  });

  it('rejects an incomplete tail and invalid original sizes', () => {
    expect(() => parseVirtualBoyRomHeader(new Uint8Array(0x21f), MIN_ROM_SIZE)).toThrow(
      /incomplete ROM tail/i,
    );
    expect(() => parseVirtualBoyRomHeader(new Uint8Array(0x220), 20000)).toThrow(/power of two/i);
    expect(() => parseVirtualBoyRomHeader(new Uint8Array(MIN_ROM_SIZE * 2), MIN_ROM_SIZE)).toThrow(
      /incomplete ROM tail/i,
    );
  });
});
