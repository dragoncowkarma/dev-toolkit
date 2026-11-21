import { describe, expect, it } from 'vitest';
import { parseCabHeader } from './cab-header-inspector.utils.js';

function pushUint16(bytes, value) {
  bytes.push(value & 0xff, value >> 8);
}

function pushUint32(bytes, value) {
  bytes.push(
    value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff
  );
}

function pushString(bytes, value) {
  bytes.push(...new TextEncoder().encode(value), 0);
}

function createCab({
  folders = [{ start: 100, blocks: 1, compression: 1 }], files = [], flags = 0,
}) {
  const bytes = [0x4d, 0x53, 0x43, 0x46];
  pushUint32(bytes, 0); pushUint32(bytes, 0); pushUint32(bytes, 0);
  pushUint32(bytes, 36 + folders.length * 8);
  pushUint32(bytes, 0);
  bytes.push(3, 1);
  pushUint16(bytes, folders.length); pushUint16(bytes, files.length);
  pushUint16(bytes, flags);
  pushUint16(bytes, 7); pushUint16(bytes, 0);
  for (const folder of folders) {
    pushUint32(bytes, folder.start); pushUint16(bytes, folder.blocks);
    pushUint16(bytes, folder.compression);
  }
  for (const file of files) {
    pushUint32(bytes, file.size);
    pushUint32(bytes, file.offset);
    pushUint16(bytes, file.folder ?? 0);
    pushUint16(bytes, file.date ?? 0x5761); pushUint16(bytes, file.time ?? 0x645c);
    pushUint16(bytes, file.attributes ?? 0x20);
    pushString(bytes, file.name);
  }
  const size = bytes.length;
  bytes[8] = size & 0xff;
  bytes[9] = (size >> 8) & 0xff;
  bytes[10] = (size >> 16) & 0xff;
  bytes[11] = (size >> 24) & 0xff;
  return Uint8Array.from(bytes).buffer;
}

describe('parseCabHeader', () => {
  it('parses a valid single-folder, single-file cabinet', () => {
    const cabinet = createCab({ files: [{ name: 'readme.txt', size: 42, offset: 0 }] });
    const parsed = parseCabHeader(cabinet);
    expect(parsed.header.signature).toBe('MSCF');
    expect(parsed.folders).toEqual([
      { coffCabStart: 100, cCFData: 1, typeCompress: 1, compression: 'MSZIP' },
    ]);
    expect(parsed.files[0]).toMatchObject({
      name: 'readme.txt', cbFile: 42, modified: '2023-11-01 12:34:56',
    });
  });

  it('parses multiple folders and files', () => {
    const cabinet = createCab({
      folders: [
        { start: 120, blocks: 2, compression: 0 }, { start: 160, blocks: 3, compression: 3 },
      ],
      files: [
        { name: 'one.bin', size: 1, offset: 0 },
        { name: 'two.bin', size: 2, offset: 5, folder: 1 },
      ],
    });
    const parsed = parseCabHeader(cabinet);
    expect(parsed.folders).toHaveLength(2);
    expect(parsed.folders[1].compression).toBe('LZX');
    expect(parsed.files.map((file) => file.name)).toEqual(['one.bin', 'two.bin']);
  });

  it('rejects corrupt or truncated headers before unchecked reads', () => {
    const truncated = new Uint8Array([0x4d, 0x53, 0x43, 0x46]).buffer;
    expect(() => parseCabHeader(truncated)).toThrow(/Truncated CAB/);
    const cabinet = new Uint8Array(createCab({ files: [] }));
    cabinet[16] = 0xff;
    expect(() => parseCabHeader(cabinet.buffer)).toThrow(/coffFiles/);
  });

  it('rejects a bad signature', () => {
    const cabinet = new Uint8Array(createCab({ files: [] }));
    cabinet[0] = 0;
    expect(() => parseCabHeader(cabinet.buffer)).toThrow(/Invalid CAB signature/);
  });

  it('decodes UTF-8 file names when the header flag is present', () => {
    const cabinet = createCab({
      flags: 0x0080, files: [{ name: '안녕.txt', size: 1, offset: 0 }],
    });
    expect(parseCabHeader(cabinet).files[0].name).toBe('안녕.txt');
  });
});
