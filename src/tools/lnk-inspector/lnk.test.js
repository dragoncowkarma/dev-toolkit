import { describe, expect, it } from 'vitest';
import { parseLnk } from './lnk.utils.js';

const CLSID_BYTES = [1, 0x14, 2, 0, 0, 0, 0, 0, 0xc0, 0, 0, 0, 0, 0, 0, 0x46];
const FLAGS = { LINK_INFO: 2, NAME: 4, RELATIVE: 8, UNICODE: 0x80 };

function ansi(value) { return [...value].map((character) => character.charCodeAt(0)); }
function utf16(value) {
  return [...value].flatMap((character) => {
    const code = character.charCodeAt(0);
    return [code & 0xff, code >> 8];
  });
}
function write32(bytes, offset, value) {
  new DataView(bytes.buffer).setUint32(offset, value, true);
}
function stringData(value, unicode) {
  const encoded = unicode ? utf16(value) : ansi(value);
  const output = new Uint8Array(2 + encoded.length);
  new DataView(output.buffer).setUint16(0, value.length, true);
  output.set(encoded, 2);
  return output;
}

function header(flags) {
  const bytes = new Uint8Array(76);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x4c, true);
  bytes.set(CLSID_BYTES, 4);
  view.setUint32(20, flags, true);
  view.setUint32(24, 0x20, true);
  view.setUint32(52, 42, true);
  view.setInt32(56, -1, true);
  view.setUint32(60, 1, true);
  return bytes;
}

function localLinkInfo() {
  const base = ansi('C:\\Apps\\demo.exe\0');
  const suffix = ansi('demo.exe\0');
  const volume = new Uint8Array(18);
  write32(volume, 0, 18); write32(volume, 4, 3); write32(volume, 8, 0x1234);
  write32(volume, 12, 16); volume.set(ansi('C\0'), 16);
  const output = new Uint8Array(28 + volume.length + base.length + suffix.length);
  write32(output, 0, output.length); write32(output, 4, 28); write32(output, 8, 1);
  write32(output, 12, 28); write32(output, 16, 46); write32(output, 24, 46 + base.length);
  output.set(volume, 28); output.set(base, 46); output.set(suffix, 46 + base.length);
  return output;
}

function networkLinkInfo() {
  const networkName = ansi('\\\\server\\share\0');
  const network = new Uint8Array(20 + networkName.length);
  write32(network, 0, network.length); write32(network, 8, 20); write32(network, 16, 0x20000);
  network.set(networkName, 20);
  const suffix = ansi('folder\\file.txt\0');
  const output = new Uint8Array(28 + network.length + suffix.length);
  write32(output, 0, output.length); write32(output, 4, 28); write32(output, 8, 2);
  write32(output, 20, 28); write32(output, 24, 28 + network.length);
  output.set(network, 28); output.set(suffix, 28 + network.length);
  return output;
}

function join(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length); let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output.buffer;
}

describe('parseLnk', () => {
  it('parses a valid shortcut with a local VolumeID and target path', () => {
    const parsed = parseLnk(join(header(FLAGS.LINK_INFO), localLinkInfo()));
    expect(parsed.header.clsid).toBe('00021401-0000-0000-c000-000000000046');
    expect(parsed.header.fileAttributes).toEqual(['Archive']);
    expect(parsed.linkInfo.localBasePath).toBe('C:\\Apps\\demo.exe');
    expect(parsed.linkInfo.volume).toMatchObject({ driveType: 'Fixed', label: 'C' });
  });

  it('parses a valid shortcut with a CommonNetworkRelativeLink', () => {
    const parsed = parseLnk(join(header(FLAGS.LINK_INFO), networkLinkInfo()));
    expect(parsed.linkInfo.network).toMatchObject({ networkName: '\\\\server\\share' });
    expect(parsed.linkInfo.commonPathSuffix).toBe('folder\\file.txt');
  });

  it('decodes Unicode and ANSI StringData according to IsUnicode', () => {
    const unicode = parseLnk(join(header(FLAGS.NAME | FLAGS.UNICODE), stringData('한글', true)));
    const ansi = parseLnk(join(header(FLAGS.RELATIVE), stringData('readme.txt', false)));
    expect(unicode.stringData.Name).toBe('한글');
    expect(unicode.stringEncoding).toBe('UTF-16LE');
    expect(ansi.stringData['Relative path']).toBe('readme.txt');
    expect(ansi.stringEncoding).toContain('ANSI');
  });

  it('rejects truncated input and invalid ShellLinkHeader fields', () => {
    expect(() => parseLnk(new ArrayBuffer(12))).toThrow(/Truncated/);
    const invalid = header(0); write32(invalid, 0, 0x4d);
    expect(() => parseLnk(invalid.buffer)).toThrow(/Invalid HeaderSize/);
  });
});
