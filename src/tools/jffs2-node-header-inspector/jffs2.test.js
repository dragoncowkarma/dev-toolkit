import { describe, expect, it, vi } from 'vitest';
import {
  JFFS2_MAGIC,
  MAX_INSPECT_BYTES,
  align4,
  buildJffs2Node,
  concatBytes,
  createSampleJffs2Image,
  detectByteOrder,
  formatHex,
  getNodeTypeName,
  inspectJffs2File,
  jffs2Crc32,
  parseJffs2Nodes,
  readJffs2Slice,
} from './jffs2.utils.js';

describe('jffs2Crc32', () => {
  it('matches known Linux JFFS2 LE CLEANMARKER hdr_crc (0xe41eb0b1)', () => {
    const header = new Uint8Array([0x85, 0x19, 0x03, 0x20, 0x0c, 0x00, 0x00, 0x00]);
    expect(jffs2Crc32(header)).toBe(0xe41eb0b1);
  });

  it('matches known Linux JFFS2 BE CLEANMARKER hdr_crc (0xf060dc98)', () => {
    const header = new Uint8Array([0x19, 0x85, 0x20, 0x03, 0x00, 0x00, 0x00, 0x0c]);
    expect(jffs2Crc32(header)).toBe(0xf060dc98);
  });

  it('supports slicing via start and length arguments', () => {
    const bytes = new Uint8Array([0xff, 0xff, 0x85, 0x19, 0x03, 0x20, 0x0c, 0x00, 0x00, 0x00]);
    expect(jffs2Crc32(bytes, 2, 8)).toBe(0xe41eb0b1);
  });
});

describe('detectByteOrder and helpers', () => {
  it('detects little-endian from 0x1985 and big-endian from 0x8519', () => {
    expect(detectByteOrder(new Uint8Array([0x85, 0x19]))).toBe('little');
    expect(detectByteOrder(new Uint8Array([0x19, 0x85]))).toBe('big');
    expect(detectByteOrder(new Uint8Array([0xde, 0xad]))).toBeNull();
    expect(detectByteOrder(new Uint8Array([0x85]))).toBeNull();
  });

  it('aligns lengths to 4-byte boundaries without overflowing large values', () => {
    expect(align4(12)).toBe(12);
    expect(align4(13)).toBe(16);
    expect(align4(14)).toBe(16);
    expect(align4(15)).toBe(16);
    expect(align4(0xffffffff)).toBe(0x100000000);
  });

  it('maps all required nodetypes and returns UNKNOWN otherwise', () => {
    expect(getNodeTypeName(0xe001)).toBe('DIRENT');
    expect(getNodeTypeName(0xe002)).toBe('INODE');
    expect(getNodeTypeName(0x2003)).toBe('CLEANMARKER');
    expect(getNodeTypeName(0x2004)).toBe('PADDING');
    expect(getNodeTypeName(0x2006)).toBe('SUMMARY');
    expect(getNodeTypeName(0xe008)).toBe('XATTR');
    expect(getNodeTypeName(0xe009)).toBe('XREF');
    expect(getNodeTypeName(0x1234)).toBe('UNKNOWN');
  });

  it('formats hex values with 0x prefix and uppercase padding', () => {
    expect(formatHex(0x1985)).toBe('0x1985');
    expect(formatHex(0x0c, 8)).toBe('0x0000000C');
  });
});

describe('parseJffs2Nodes', () => {
  it('walks consecutive 4-byte-aligned little-endian nodes and verifies CRCs', () => {
    const image = concatBytes([
      buildJffs2Node({ nodetype: 0x2003, totlen: 12, littleEndian: true }),
      buildJffs2Node({ nodetype: 0xe002, totlen: 21, littleEndian: true }),
      buildJffs2Node({ nodetype: 0xe001, totlen: 16, littleEndian: true }),
      buildJffs2Node({ nodetype: 0x2004, totlen: 12, littleEndian: true }),
      buildJffs2Node({ nodetype: 0x2006, totlen: 14, littleEndian: true }),
      buildJffs2Node({ nodetype: 0xe008, totlen: 20, littleEndian: true }),
      buildJffs2Node({ nodetype: 0xe009, totlen: 12, littleEndian: true }),
    ]);

    const result = parseJffs2Nodes(image);

    expect(result.byteOrder).toBe('little');
    expect(result.magicSignature).toBe('0x1985');
    expect(result.flags).toHaveLength(0);
    expect(result.nodes).toHaveLength(7);
    expect(result.nodes.map((n) => n.nodetypeName)).toEqual([
      'CLEANMARKER',
      'INODE',
      'DIRENT',
      'PADDING',
      'SUMMARY',
      'XATTR',
      'XREF',
    ]);
    // 12 -> offset 12, totlen 21 aligns to 24 -> offset 36
    expect(result.nodes[1].offset).toBe(12);
    expect(result.nodes[1].alignedLength).toBe(24);
    expect(result.nodes[2].offset).toBe(36);
    expect(result.nodes[0].hdrCrc).toBe(0xe41eb0b1);
    expect(result.nodes.every((n) => n.magic === JFFS2_MAGIC && n.crcValid)).toBe(true);
  });

  it('detects big-endian byte order (0x8519) and verifies node headers', () => {
    const image = concatBytes([
      buildJffs2Node({ nodetype: 0x2003, totlen: 12, littleEndian: false }),
      buildJffs2Node({ nodetype: 0xe002, totlen: 30, littleEndian: false }),
      buildJffs2Node({ nodetype: 0xe001, totlen: 20, littleEndian: false }),
    ]);

    const result = parseJffs2Nodes(image);

    expect(result.byteOrder).toBe('big');
    expect(result.magicSignature).toBe('0x8519');
    expect(result.flags).toHaveLength(0);
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[0].magic).toBe(JFFS2_MAGIC);
    expect(result.nodes[0].nodetypeName).toBe('CLEANMARKER');
    expect(result.nodes[0].hdrCrc).toBe(0xf060dc98);
    expect(result.nodes[1].nodetypeName).toBe('INODE');
    expect(result.nodes[1].totlen).toBe(30);
    expect(result.nodes[2].offset).toBe(44);
    expect(result.nodes.every((n) => n.crcValid)).toBe(true);
  });

  it('flags a CRC mismatch while reporting stored and expected hdr_crc', () => {
    const image = concatBytes([
      buildJffs2Node({
        nodetype: 0x2003,
        totlen: 12,
        littleEndian: true,
        hdrCrc: 0xdeadbeef,
      }),
      buildJffs2Node({ nodetype: 0xe001, totlen: 16, littleEndian: true }),
    ]);

    const result = parseJffs2Nodes(image);

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].crcValid).toBe(false);
    expect(result.nodes[0].hdrCrc).toBe(0xdeadbeef);
    expect(result.nodes[0].expectedCrc).toBe(0xe41eb0b1);
    expect(result.nodes[0].flags).toContain('crc-mismatch');
    expect(result.nodes[1].crcValid).toBe(true);
    expect(result.summary.invalidCrcCount).toBe(1);
    expect(result.summary.validCrcCount).toBe(1);
    expect(result.flags.some((f) => f.code === 'crc-mismatch')).toBe(true);
  });

  it('flags a truncated node when totlen exceeds the remaining buffer', () => {
    const truncatedNode = buildJffs2Node({
      nodetype: 0xe002,
      totlen: 64,
      littleEndian: true,
      bufferLength: 20,
    });

    const result = parseJffs2Nodes(truncatedNode);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].truncated).toBe(true);
    expect(result.nodes[0].windowLimited).toBe(false);
    expect(result.nodes[0].crcValid).toBe(true);
    expect(result.summary.truncatedCount).toBe(1);
    expect(result.flags).toContainEqual(
      expect.objectContaining({ code: 'truncated-node', severity: 'error' }),
    );
  });

  it('reports window-limited-node (info) instead of truncated-node when node exceeds 4096 B cap in an 8192 B file', async () => {
    const raw = new Uint8Array(8192);
    const largeInode = buildJffs2Node({
      nodetype: 0xe002,
      totlen: 4164,
      littleEndian: true,
      bufferLength: 4164,
    });
    raw.set(largeInode, 0);

    const file = new File([raw], 'large-inode.jffs2', { type: 'application/octet-stream' });
    const report = await inspectJffs2File(file);

    expect(report.inspectedBytes).toBe(MAX_INSPECT_BYTES);
    expect(report.totalBytes).toBe(8192);
    expect(report.wasWindowTruncated).toBe(true);
    expect(report.nodes).toHaveLength(1);
    expect(report.nodes[0].crcValid).toBe(true);
    expect(report.nodes[0].truncated).toBe(false);
    expect(report.nodes[0].windowLimited).toBe(true);
    expect(report.nodes[0].flags).toEqual(['window-limited-node']);
    expect(report.summary.truncatedCount).toBe(0);
    expect(report.flags.some((f) => f.code === 'truncated-node')).toBe(false);
    expect(report.flags).toContainEqual(
      expect.objectContaining({ code: 'window-limited-node', severity: 'info' }),
    );
  });

  it('still flags truncated-node when totlen exceeds the real file size of an 8192 B file', async () => {
    const raw = new Uint8Array(8192);
    const oversizedInode = buildJffs2Node({
      nodetype: 0xe002,
      totlen: 9000,
      littleEndian: true,
      bufferLength: 64,
    });
    raw.set(oversizedInode, 0);

    const file = new File([raw], 'eof-truncated.jffs2', { type: 'application/octet-stream' });
    const report = await inspectJffs2File(file);

    expect(report.nodes).toHaveLength(1);
    expect(report.nodes[0].truncated).toBe(true);
    expect(report.nodes[0].windowLimited).toBe(false);
    expect(report.summary.truncatedCount).toBe(1);
    expect(report.flags).toContainEqual(
      expect.objectContaining({ code: 'truncated-node', severity: 'error' }),
    );
  });

  it('reports window-limited-header when a node header crosses the 4096 B window boundary', async () => {
    const raw = new Uint8Array(8192).fill(0xff);
    const leadingCleanmarker = buildJffs2Node({
      nodetype: 0x2003,
      totlen: 12,
      littleEndian: true,
    });
    const boundaryNode = buildJffs2Node({
      nodetype: 0x2003,
      totlen: 12,
      littleEndian: true,
    });
    raw.set(leadingCleanmarker, 0);
    raw.set(boundaryNode, MAX_INSPECT_BYTES - 4);

    const file = new File([raw], 'boundary-header.jffs2', { type: 'application/octet-stream' });
    const report = await inspectJffs2File(file);

    expect(report.summary.truncatedCount).toBe(0);
    expect(report.flags.some((f) => f.code === 'truncated-header')).toBe(false);
    expect(report.flags).toContainEqual(
      expect.objectContaining({ code: 'window-limited-header', severity: 'info' }),
    );
  });

  it('flags a truncated header when fewer than 12 non-erased bytes remain', () => {
    const valid = buildJffs2Node({ nodetype: 0x2003, totlen: 12, littleEndian: true });
    const partialHeader = new Uint8Array([0x85, 0x19, 0x02, 0xe0, 0x44, 0x00]);
    const result = parseJffs2Nodes(concatBytes([valid, partialHeader]));

    expect(result.nodes).toHaveLength(1);
    expect(result.summary.truncatedCount).toBe(1);
    expect(result.flags.some((f) => f.code === 'truncated-header')).toBe(true);
  });

  it('flags totlen smaller than the 12-byte header and stops safely', () => {
    const badNode = buildJffs2Node({
      nodetype: 0x2004,
      totlen: 8,
      littleEndian: true,
      bufferLength: 16,
    });

    const result = parseJffs2Nodes(badNode);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].totlen).toBe(8);
    expect(result.nodes[0].totlenTooSmall).toBe(true);
    expect(result.summary.totlenTooSmallCount).toBe(1);
    expect(result.flags.some((f) => f.code === 'totlen-too-small')).toBe(true);
  });

  it('flags erased (0xFF) regions both standalone and trailing after nodes', () => {
    const allErased = parseJffs2Nodes(new Uint8Array(64).fill(0xff));
    expect(allErased.nodes).toHaveLength(0);
    expect(allErased.regions).toEqual([
      { kind: 'erased', fillByte: 0xff, offset: 0, length: 64 },
    ]);
    expect(allErased.summary.erasedRegionCount).toBe(1);
    expect(allErased.flags[0].code).toBe('erased-region');

    const withTail = parseJffs2Nodes(createSampleJffs2Image('little'));
    expect(withTail.nodes).toHaveLength(7);
    expect(withTail.regions).toHaveLength(1);
    expect(withTail.regions[0]).toMatchObject({ kind: 'erased', fillByte: 0xff, length: 32 });
    expect(withTail.flags.some((f) => f.code === 'erased-region')).toBe(true);
  });

  it('flags zero-filled (0x00) regions and continues scanning aligned nodes', () => {
    const image = concatBytes([
      new Uint8Array(16).fill(0x00),
      buildJffs2Node({ nodetype: 0x2003, totlen: 12, littleEndian: true }),
    ]);

    const result = parseJffs2Nodes(image);

    expect(result.byteOrder).toBe('little');
    expect(result.regions).toEqual([
      { kind: 'zero-filled', fillByte: 0x00, offset: 0, length: 16 },
    ]);
    expect(result.summary.zeroFilledRegionCount).toBe(1);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].offset).toBe(16);
  });

  it('flags empty input and invalid magic bytes', () => {
    const empty = parseJffs2Nodes(new Uint8Array(0));
    expect(empty.flags[0].code).toBe('empty-input');

    const garbage = parseJffs2Nodes(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]));
    expect(garbage.byteOrder).toBeNull();
    expect(garbage.flags[0].code).toBe('invalid-magic');
  });
});

describe('readJffs2Slice and inspectJffs2File', () => {
  it('reads only the first 4096 bytes via file.slice(0, 4096)', async () => {
    const raw = new Uint8Array(8192).fill(0xff);
    const cleanmarker = buildJffs2Node({ nodetype: 0x2003, totlen: 12, littleEndian: true });
    raw.set(cleanmarker, 0);

    const file = new File([raw], 'flash.jffs2', { type: 'application/octet-stream' });
    const sliceSpy = vi.spyOn(file, 'slice');

    const slicedBytes = await readJffs2Slice(file);
    expect(sliceSpy).toHaveBeenCalledWith(0, MAX_INSPECT_BYTES);
    expect(slicedBytes.length).toBe(4096);

    const report = await inspectJffs2File(file);
    expect(report.inspectedBytes).toBe(4096);
    expect(report.totalBytes).toBe(8192);
    expect(report.wasWindowTruncated).toBe(true);
    expect(report.nodes).toHaveLength(1);
    expect(report.regions[0]).toMatchObject({ kind: 'erased', offset: 12, length: 4084 });
  });

  it('rejects non-Blob inputs', async () => {
    await expect(readJffs2Slice(null)).rejects.toThrow(TypeError);
  });
});
