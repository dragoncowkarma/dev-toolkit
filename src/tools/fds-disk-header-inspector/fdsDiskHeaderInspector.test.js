import { describe, expect, it, vi } from 'vitest';
import {
  FDS_BLOCK1_CODE,
  FDS_BLOCK1_SIZE,
  FDS_SIDE_SIZE,
  FDS_VERIFICATION_STRING,
  FWNES_HEADER_SIZE,
  MAX_INSPECTED_SIDES,
  UNKNOWN_VALUE,
  inspectFdsFile,
  parseFdsBlock1,
  parseFwNesHeader,
} from './fdsDiskHeaderInspector.utils.js';

function writeAscii(target, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    target[offset + i] = text.charCodeAt(i);
  }
}

function buildFwNesHeader(sideCount, extraPaddingByte = 0) {
  const header = new Uint8Array(FWNES_HEADER_SIZE);
  header[0] = 0x46; // F
  header[1] = 0x44; // D
  header[2] = 0x53; // S
  header[3] = 0x1a; // EOF
  header[4] = sideCount;
  header[5] = extraPaddingByte;
  return header;
}

function buildDiskSide({
  size = FDS_SIDE_SIZE,
  blockCode = FDS_BLOCK1_CODE,
  verification = FDS_VERIFICATION_STRING,
  makerCode = 0x01,
  gameName = 'ZEL',
  gameType = 0x20,
  gameVersion = 0x01,
  sideNumber = 0x00,
  diskNumber = 0x00,
  diskType = 0x00,
} = {}) {
  const side = new Uint8Array(size);
  if (size > 0) side[0] = blockCode;
  if (size >= 15) writeAscii(side, 1, verification.slice(0, 14));
  if (size > 0x0f) side[0x0f] = makerCode;
  if (size >= 0x13) writeAscii(side, 0x10, gameName.slice(0, 3));
  if (size > 0x13) side[0x13] = gameType;
  if (size > 0x14) side[0x14] = gameVersion;
  if (size > 0x15) side[0x15] = sideNumber;
  if (size > 0x16) side[0x16] = diskNumber;
  if (size > 0x17) side[0x17] = diskType;
  return side;
}

function concatBytes(...chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

describe('parseFwNesHeader', () => {
  it('detects a valid 16-byte FDS fwNES header and side count', () => {
    const header = buildFwNesHeader(2);
    const parsed = parseFwNesHeader(header, FWNES_HEADER_SIZE + FDS_SIDE_SIZE * 2);

    expect(parsed).toEqual({
      present: true,
      truncatedSignature: false,
      size: 16,
      sideCount: 2,
      hasNonZeroPadding: false,
    });
  });

  it('flags non-zero padding bytes in the fwNES header', () => {
    const header = buildFwNesHeader(1, 0xff);
    const parsed = parseFwNesHeader(header, 16);

    expect(parsed.present).toBe(true);
    expect(parsed.hasNonZeroPadding).toBe(true);
  });

  it('flags a truncated FDS signature when file is shorter than 16 bytes', () => {
    const bytes = new Uint8Array([0x46, 0x44, 0x53, 0x1a, 0x01, 0x00]);
    const parsed = parseFwNesHeader(bytes, bytes.length);

    expect(parsed.present).toBe(false);
    expect(parsed.truncatedSignature).toBe(true);
    expect(parsed.sideCount).toBeNull();
  });
});

describe('parseFdsBlock1', () => {
  it('parses all required Block 1 fields for a valid side', () => {
    const block = buildDiskSide({
      size: FDS_BLOCK1_SIZE,
      makerCode: 0x01,
      gameName: 'ZEL',
      gameVersion: 0x01,
      sideNumber: 0x00,
      diskNumber: 0x00,
      diskType: 0x00,
    });

    const parsed = parseFdsBlock1(block, {
      sideIndex: 0,
      offset: 0,
      isCompleteSide: true,
      availableBytes: FDS_SIDE_SIZE,
    });

    expect(parsed.blockCodeValid).toBe(true);
    expect(parsed.blockCode).toBe('0x01 (Disk info block)');
    expect(parsed.verificationValid).toBe(true);
    expect(parsed.verificationString).toBe('*NINTENDO-HVC*');
    expect(parsed.makerCode).toBe('0x01 (Nintendo)');
    expect(parsed.gameName).toBe('ZEL');
    expect(parsed.gameVersion).toBe('1 (0x01)');
    expect(parsed.sideNumber).toBe('Side A (0x00)');
    expect(parsed.diskNumber).toBe('Disk 1 (0x00)');
    expect(parsed.diskType).toBe('FMC - Normal card (0x00)');
    expect(parsed.headerBlockMatched).toBe(true);
    expect(parsed.issues).toEqual([]);
  });

  it('reports Unknown for unreadable fields in a truncated block', () => {
    const truncated = buildDiskSide({ size: 18, makerCode: 0xa4 });
    const parsed = parseFdsBlock1(truncated, {
      sideIndex: 0,
      offset: 0,
      isCompleteSide: false,
      availableBytes: 18,
    });

    expect(parsed.blockCodeValid).toBe(true);
    expect(parsed.verificationValid).toBe(true);
    expect(parsed.makerCode).toBe('0xA4 (Konami)');
    expect(parsed.gameName).toBe(UNKNOWN_VALUE);
    expect(parsed.gameVersion).toBe(UNKNOWN_VALUE);
    expect(parsed.sideNumber).toBe(UNKNOWN_VALUE);
    expect(parsed.diskNumber).toBe(UNKNOWN_VALUE);
    expect(parsed.diskType).toBe(UNKNOWN_VALUE);
    expect(parsed.issues.length).toBeGreaterThan(0);
  });

  it('reports Unknown for unrecognized enum codes and non-printable game names', () => {
    const block = buildDiskSide({
      size: FDS_BLOCK1_SIZE,
      makerCode: 0x55,
      gameName: '\x00\x00\x00',
      sideNumber: 0x05,
      diskType: 0x09,
    });
    block[0x10] = 0x00;
    block[0x11] = 0x01;
    block[0x12] = 0x02;

    const parsed = parseFdsBlock1(block);

    expect(parsed.makerCode).toBe('0x55 (Unknown)');
    expect(parsed.gameName).toBe(UNKNOWN_VALUE);
    expect(parsed.sideNumber).toBe('Unknown (0x05)');
    expect(parsed.diskType).toBe('Unknown (0x09)');
  });
});

describe('inspectFdsFile', () => {
  it('inspects a raw single-side FDS image without a fwNES header', async () => {
    const rawSide = buildDiskSide({
      makerCode: 0x01,
      gameName: 'SMB',
      gameVersion: 0x00,
      sideNumber: 0x00,
      diskNumber: 0x00,
      diskType: 0x00,
    });
    const file = new File([rawSide], 'smb2.fds');

    const report = await inspectFdsFile(file);

    expect(report.fileName).toBe('smb2.fds');
    expect(report.fileSize).toBe(FDS_SIDE_SIZE);
    expect(report.isEmpty).toBe(false);
    expect(report.fwNesHeader.present).toBe(false);
    expect(report.fwNesHeader.sideCount).toBeNull();
    expect(report.derivedSideCount).toBe(1);
    expect(report.trailingBytes).toBe(0);
    expect(report.sides).toHaveLength(1);
    expect(report.sides[0].offset).toBe(0);
    expect(report.sides[0].gameName).toBe('SMB');
    expect(report.sides[0].headerBlockMatched).toBe(true);
    expect(report.warnings).toEqual([]);
    expect(report.scopeNote).toMatch(/not verified/i);
  });

  it('inspects a headered single-side FDS image with 16-byte fwNES header', async () => {
    const header = buildFwNesHeader(1);
    const side = buildDiskSide({
      makerCode: 0x01,
      gameName: 'MET',
      gameVersion: 0x02,
      sideNumber: 0x00,
      diskNumber: 0x00,
      diskType: 0x01,
    });
    const file = new File([concatBytes(header, side)], 'metroid.fds');

    const report = await inspectFdsFile(file);

    expect(report.fileSize).toBe(FWNES_HEADER_SIZE + FDS_SIDE_SIZE);
    expect(report.fwNesHeader.present).toBe(true);
    expect(report.fwNesHeader.sideCount).toBe(1);
    expect(report.derivedSideCount).toBe(1);
    expect(report.trailingBytes).toBe(0);
    expect(report.sides).toHaveLength(1);
    expect(report.sides[0].offset).toBe(16);
    expect(report.sides[0].gameName).toBe('MET');
    expect(report.sides[0].gameVersion).toBe('2 (0x02)');
    expect(report.sides[0].diskType).toBe('FSC - Card with shutter (0x01)');
    expect(report.warnings).toEqual([]);
  });

  it('inspects multiple disk sides and reports distinct per-side metadata', async () => {
    const header = buildFwNesHeader(2);
    const sideA = buildDiskSide({
      makerCode: 0xa4,
      gameName: 'AKM',
      gameVersion: 0x00,
      sideNumber: 0x00,
      diskNumber: 0x00,
      diskType: 0x00,
    });
    const sideB = buildDiskSide({
      makerCode: 0xa4,
      gameName: 'AKM',
      gameVersion: 0x00,
      sideNumber: 0x01,
      diskNumber: 0x00,
      diskType: 0x00,
    });
    const file = new File([concatBytes(header, sideA, sideB)], 'dracula.fds');

    const report = await inspectFdsFile(file);

    expect(report.fwNesHeader.present).toBe(true);
    expect(report.fwNesHeader.sideCount).toBe(2);
    expect(report.derivedSideCount).toBe(2);
    expect(report.trailingBytes).toBe(0);
    expect(report.sides).toHaveLength(2);
    expect(report.sides[0].offset).toBe(16);
    expect(report.sides[0].sideNumber).toBe('Side A (0x00)');
    expect(report.sides[1].offset).toBe(16 + FDS_SIDE_SIZE);
    expect(report.sides[1].sideNumber).toBe('Side B (0x01)');
    expect(report.sides[1].makerCode).toBe('0xA4 (Konami)');
    expect(report.warnings).toEqual([]);
  });

  it('detects a bad verification string and wrong block code without crashing', async () => {
    const badSide = buildDiskSide({
      blockCode: 0x02,
      verification: '*BAD-HEADER-!*',
      makerCode: 0x08,
      gameName: 'CAP',
    });
    const file = new File([badSide], 'corrupt.fds');

    const report = await inspectFdsFile(file);

    expect(report.sides).toHaveLength(1);
    expect(report.sides[0].blockCodeValid).toBe(false);
    expect(report.sides[0].blockCode).toBe('0x02 (Expected 0x01)');
    expect(report.sides[0].verificationValid).toBe(false);
    expect(report.sides[0].verificationString).toBe('*BAD-HEADER-!*');
    expect(report.sides[0].headerBlockMatched).toBe(false);
    expect(report.sides[0].makerCode).toBe('0x08 (Capcom)');
    expect(report.warnings.some((w) => w.includes('*NINTENDO-HVC*'))).toBe(true);
  });

  it('reports trailing bytes separately and Unknown fields on a truncated image', async () => {
    const header = buildFwNesHeader(2);
    const fullSide = buildDiskSide({ gameName: 'ZEL', sideNumber: 0x00 });
    const partialSide = buildDiskSide({ size: 20, gameName: 'ZEL', makerCode: 0x01 });
    const file = new File([concatBytes(header, fullSide, partialSide)], 'truncated.fds');

    const report = await inspectFdsFile(file);

    expect(report.fwNesHeader.sideCount).toBe(2);
    expect(report.derivedSideCount).toBe(1);
    expect(report.trailingBytes).toBe(20);
    expect(report.sides).toHaveLength(2);
    expect(report.sides[0].isCompleteSide).toBe(true);
    expect(report.sides[1].isCompleteSide).toBe(false);
    expect(report.sides[1].availableBytes).toBe(20);
    expect(report.sides[1].gameName).toBe('ZEL');
    expect(report.sides[1].gameVersion).toBe(UNKNOWN_VALUE);
    expect(report.sides[1].sideNumber).toBe(UNKNOWN_VALUE);
    expect(report.sides[1].diskNumber).toBe(UNKNOWN_VALUE);
    expect(report.sides[1].diskType).toBe(UNKNOWN_VALUE);
    expect(report.warnings.some((w) => w.includes('20 B of trailing data'))).toBe(true);
    expect(report.warnings.some((w) => w.includes('reports 2 side(s)'))).toBe(true);
  });

  it('handles an empty file cleanly without reading slices', async () => {
    const emptyFile = new File([], 'empty.fds');
    const sliceSpy = vi.spyOn(emptyFile, 'slice');

    const report = await inspectFdsFile(emptyFile);

    expect(sliceSpy).not.toHaveBeenCalled();
    expect(report.isEmpty).toBe(true);
    expect(report.fileSize).toBe(0);
    expect(report.fwNesHeader.present).toBe(false);
    expect(report.derivedSideCount).toBe(0);
    expect(report.trailingBytes).toBe(0);
    expect(report.sides).toEqual([]);
    expect(report.warnings.some((w) => w.includes('empty'))).toBe(true);
  });

  it('reads only bounded slices and caps inspection on oversized files', async () => {
    const requestedRanges = [];
    const hugeSideCount = MAX_INSPECTED_SIDES + 10;
    const virtualSize = FWNES_HEADER_SIZE + hugeSideCount * FDS_SIDE_SIZE;
    const header = buildFwNesHeader(hugeSideCount);
    const block1 = buildDiskSide({ size: FDS_BLOCK1_SIZE, gameName: 'BIG' });

    const mockFile = {
      name: 'huge.fds',
      size: virtualSize,
      slice(start, end) {
        requestedRanges.push([start, end]);
        const length = Math.max(0, end - start);
        const bytes = start === 0 ? header.subarray(0, length) : block1.subarray(0, length);
        return {
          arrayBuffer: () =>
            Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)),
        };
      },
    };

    const report = await inspectFdsFile(mockFile);

    expect(report.derivedSideCount).toBe(hugeSideCount);
    expect(report.inspectedSideCount).toBe(MAX_INSPECTED_SIDES);
    expect(report.omittedSideCount).toBe(10);
    expect(requestedRanges).toHaveLength(1 + MAX_INSPECTED_SIDES);
    for (const [start, end] of requestedRanges) {
      expect(end - start).toBeLessThanOrEqual(FDS_BLOCK1_SIZE);
    }
    expect(report.warnings.some((w) => w.includes('bounded'))).toBe(true);
  });

  it('throws TypeError when given an invalid input', async () => {
    await expect(inspectFdsFile(null)).rejects.toThrow(TypeError);
  });
});
