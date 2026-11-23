import { describe, expect, it, vi } from 'vitest';
import {
  createSample, formatHex, parseHex, parseXfsSuperblock, readSuperblock,
} from './xfs.utils.js';

function rawSuperblock() {
  const bytes = new Uint8Array(512);
  const v = new DataView(bytes.buffer);
  v.setUint32(0, 0x58465342); v.setUint32(4, 4096);
  v.setBigUint64(8, 9007199254740993n); v.setBigUint64(16, 123n);
  bytes.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 32);
  v.setBigUint64(56, 987654321n); v.setUint32(84, 25000); v.setUint32(88, 7);
  v.setUint32(96, 4321); v.setUint16(100, 0x8005); v.setUint16(102, 512);
  v.setUint16(104, 256); v.setUint16(106, 16);
  bytes.set([88, 70, 83, 0], 108); bytes.set([12, 9, 8], 120);
  v.setBigUint64(128, 1000n); v.setBigUint64(136, 222n); v.setBigUint64(144, 333n);
  v.setUint32(208, 0x80000000); v.setUint32(212, 5);
  v.setUint32(216, 9); v.setUint32(220, 1);
  return bytes;
}

describe('XFS parser', () => {
  it('decodes independent raw offsets and big endian values', () => {
    const result = parseXfsSuperblock(rawSuperblock());
    expect(result.ok).toBe(true);
    expect(result.version).toBe(5);
    expect(result.fields).toMatchObject({
      sb_blocksize: 4096, sb_dblocks: '9007199254740993', sb_rblocks: '123',
      sb_uuid: '00010203-0405-0607-0809-0a0b0c0d0e0f', sb_logblocks: 4321,
      sb_rootino: '987654321', sb_agblocks: 25000, sb_agcount: 7, sb_versionnum: 0x8005,
      sb_sectsize: 512, sb_inodesize: 256, sb_inopblock: 16, sb_fname: 'XFS',
      sb_blocklog: 12, sb_sectlog: 9, sb_inodelog: 8,
      sb_icount: '1000', sb_ifree: '222', sb_fdblocks: '333',
      sb_features_compat: '0x80000000 (UNKNOWN_0x80000000)',
      sb_features_ro_compat: '0x00000005 (FINOBT, REFLINK)',
      sb_features_incompat: '0x00000009 (FTYPE, BIGTIME)',
      sb_features_log_incompat: '0x00000001 (XATTRS)',
    });
  });
  it('rejects short, bad magic, unsupported versions and inconsistent geometry', () => {
    expect(parseXfsSuperblock(new Uint8Array(3)).ok).toBe(false);
    const bytes = rawSuperblock();
    bytes[0] = 0;
    expect(parseXfsSuperblock(bytes).error).toMatch(/magic/i);
    bytes[0] = 0x58; bytes[101] = 3;
    expect(parseXfsSuperblock(bytes).error).toMatch(/version/i);
    bytes[101] = 5; bytes[120] = 11;
    expect(parseXfsSuperblock(bytes).error).toMatch(/inconsistent/i);
  });
  it('supports v4 and v5 examples and hex input', () => {
    expect(parseXfsSuperblock(createSample(4)).fields).not.toHaveProperty('sb_features_compat');
    expect(parseXfsSuperblock(createSample(5)).version).toBe(5);
    expect(parseHex(formatHex(createSample(4))).bytes).toEqual(createSample(4));
    expect(parseHex('0xz').ok).toBe(false);
  });
  it('reads only a 512 byte slice', async () => {
    const file = new File([new Uint8Array(1024)], 'disk');
    const slice = vi.spyOn(file, 'slice');
    expect((await readSuperblock(file)).length).toBe(512);
    expect(slice).toHaveBeenCalledWith(0, 512);
  });
});
