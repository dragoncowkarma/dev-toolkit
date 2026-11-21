const HEADER_SIZE = 0x4c;
const SHELL_LINK_CLSID = '00021401-0000-0000-c000-000000000046';

const LINK_FLAGS = [
  [0x00000001, 'HasLinkTargetIDList'], [0x00000002, 'HasLinkInfo'],
  [0x00000004, 'HasName'], [0x00000008, 'HasRelativePath'],
  [0x00000010, 'HasWorkingDir'], [0x00000020, 'HasArguments'],
  [0x00000040, 'HasIconLocation'], [0x00000080, 'IsUnicode'],
  [0x00000100, 'ForceNoLinkInfo'], [0x00000200, 'HasExpString'],
  [0x00002000, 'RunAsUser'], [0x00008000, 'ForceNoLinkTrack'],
  [0x00020000, 'EnableTargetMetadata'], [0x00080000, 'DisableLinkPathTracking'],
  [0x00100000, 'DisableKnownFolderTracking'], [0x00200000, 'DisableKnownFolderAlias'],
  [0x00400000, 'AllowLinkToLink'], [0x00800000, 'UnaliasOnSave'],
  [0x01000000, 'PreferEnvironmentPath'], [0x02000000, 'KeepLocalIDListForUNCTarget'],
];

const FILE_ATTRIBUTES = [
  [0x00000001, 'ReadOnly'], [0x00000002, 'Hidden'], [0x00000004, 'System'],
  [0x00000010, 'Directory'], [0x00000020, 'Archive'], [0x00000040, 'Device'],
  [0x00000080, 'Normal'], [0x00000100, 'Temporary'], [0x00000200, 'SparseFile'],
  [0x00000400, 'ReparsePoint'], [0x00000800, 'Compressed'], [0x00001000, 'Offline'],
  [0x00002000, 'NotContentIndexed'], [0x00004000, 'Encrypted'],
];

const SHOW_COMMANDS = { 1: 'SW_SHOWNORMAL', 3: 'SW_SHOWMAXIMIZED', 7: 'SW_SHOWMINNOACTIVE' };
const DRIVE_TYPES = [
  'Unknown', 'No root directory', 'Removable', 'Fixed', 'Remote', 'CD-ROM', 'RAM disk',
];

function required(view, offset, length, label) {
  if (offset < 0 || length < 0 || offset + length > view.byteLength) {
    throw new Error(`Truncated .lnk data while reading ${label}.`);
  }
}

function hex(value) {
  return `0x${value.toString(16).padStart(8, '0')}`;
}

function enabledFlags(value, definitions) {
  return definitions.filter(([mask]) => (value & mask) !== 0).map(([, name]) => name);
}

function clsidFromBytes(bytes) {
  const hexBytes = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
  const first = hexBytes.slice(0, 4).reverse().join('');
  return `${first}`
    + `-${hexBytes.slice(5, 6).join('')}${hexBytes.slice(4, 5).join('')}`
    + `-${hexBytes.slice(7, 8).join('')}${hexBytes.slice(6, 7).join('')}`
    + `-${hexBytes.slice(8, 10).join('')}-${hexBytes.slice(10, 16).join('')}`;
}

function readNullTerminated(view, offset, end, unicode) {
  required(view, offset, 0, 'a null-terminated string');
  const bytes = [];
  for (let position = offset; position < end; position += unicode ? 2 : 1) {
    required(view, position, unicode ? 2 : 1, 'a null-terminated string');
    if (unicode ? view.getUint16(position, true) === 0 : view.getUint8(position) === 0) break;
    bytes.push(...new Uint8Array(view.buffer, view.byteOffset + position, unicode ? 2 : 1));
  }
  const decoder = new TextDecoder(unicode ? 'utf-16le' : 'windows-1252');
  return decoder.decode(new Uint8Array(bytes));
}

function filetimeToIso(value) {
  if (value === 0n) return 'Not set';
  const milliseconds = Number((value - 116444736000000000n) / 10000n);
  if (!Number.isSafeInteger(milliseconds)) return 'Out of range';
  return new Date(milliseconds).toISOString();
}

function parseVolumeId(view, start, end) {
  required(view, start, 16, 'VolumeID');
  const size = view.getUint32(start, true);
  required(view, start, size, 'VolumeID');
  if (start + size > end || size < 16) throw new Error('Invalid VolumeID size.');
  const labelOffset = view.getUint32(start + 12, true);
  const unicodeOffset = size >= 20 ? view.getUint32(start + 16, true) : 0;
  const label = unicodeOffset
    ? readNullTerminated(view, start + unicodeOffset, start + size, true)
    : readNullTerminated(view, start + labelOffset, start + size, false);
  return {
    driveType: DRIVE_TYPES[view.getUint32(start + 4, true)] ?? 'Unknown',
    serialNumber: hex(view.getUint32(start + 8, true)),
    label,
  };
}

function parseNetworkLink(view, start, end) {
  required(view, start, 20, 'CommonNetworkRelativeLink');
  const size = view.getUint32(start, true);
  required(view, start, size, 'CommonNetworkRelativeLink');
  if (start + size > end || size < 20) {
    throw new Error('Invalid CommonNetworkRelativeLink size.');
  }
  const netNameOffset = view.getUint32(start + 8, true);
  const deviceNameOffset = view.getUint32(start + 12, true);
  const hasUnicodeOffsets = size >= 28 && netNameOffset > 20;
  const unicodeNetNameOffset = hasUnicodeOffsets ? view.getUint32(start + 20, true) : 0;
  const unicodeDeviceNameOffset = hasUnicodeOffsets ? view.getUint32(start + 24, true) : 0;
  return {
    networkName: readNullTerminated(
      view, start + (unicodeNetNameOffset || netNameOffset), start + size,
      Boolean(unicodeNetNameOffset)
    ),
    deviceName: deviceNameOffset
      ? readNullTerminated(
        view, start + (unicodeDeviceNameOffset || deviceNameOffset), start + size,
        Boolean(unicodeDeviceNameOffset)
      )
      : '',
    providerType: hex(view.getUint32(start + 16, true)),
  };
}

function parseLinkInfo(view, start) {
  required(view, start, 28, 'LinkInfo');
  const size = view.getUint32(start, true);
  const headerSize = view.getUint32(start + 4, true);
  required(view, start, size, 'LinkInfo');
  if (size < 28 || headerSize < 28 || headerSize > size) throw new Error('Invalid LinkInfo size.');
  const end = start + size;
  const flags = view.getUint32(start + 8, true);
  const volumeIdOffset = view.getUint32(start + 12, true);
  const localBasePathOffset = view.getUint32(start + 16, true);
  const networkOffset = view.getUint32(start + 20, true);
  const suffixOffset = view.getUint32(start + 24, true);
  const localBasePathUnicodeOffset = headerSize >= 36
    ? view.getUint32(start + 28, true) : 0;
  const suffixUnicodeOffset = headerSize >= 36 ? view.getUint32(start + 32, true) : 0;
  const readAt = (offset, unicodeOffset) => offset
    ? readNullTerminated(view, start + (unicodeOffset || offset), end, Boolean(unicodeOffset)) : '';
  return {
    size,
    flags: enabledFlags(flags, [
      [1, 'VolumeIDAndLocalBasePath'], [2, 'CommonNetworkRelativeLinkAndPathSuffix'],
    ]),
    volume: (flags & 1) && volumeIdOffset
      ? parseVolumeId(view, start + volumeIdOffset, end) : null,
    localBasePath: (flags & 1) ? readAt(localBasePathOffset, localBasePathUnicodeOffset) : '',
    network: (flags & 2) && networkOffset
      ? parseNetworkLink(view, start + networkOffset, end) : null,
    commonPathSuffix: readAt(suffixOffset, suffixUnicodeOffset),
    nextOffset: end,
  };
}

function parseStringData(view, offset, flags) {
  const isUnicode = (flags & 0x80) !== 0;
  const entries = [
    [4, 'Name'], [8, 'Relative path'], [16, 'Working directory'],
    [32, 'Command-line arguments'], [64, 'Icon location'],
  ];
  const strings = {};
  let cursor = offset;
  for (const [flag, name] of entries) {
    if (!(flags & flag)) continue;
    required(view, cursor, 2, `${name} length`);
    const characters = view.getUint16(cursor, true);
    cursor += 2;
    const byteLength = characters * (isUnicode ? 2 : 1);
    required(view, cursor, byteLength, name);
    strings[name] = new TextDecoder(isUnicode ? 'utf-16le' : 'windows-1252')
      .decode(new Uint8Array(view.buffer, view.byteOffset + cursor, byteLength));
    cursor += byteLength;
  }
  return {
    strings,
    nextOffset: cursor,
    encoding: isUnicode ? 'UTF-16LE' : 'ANSI (Windows-1252)',
  };
}

/**
 * Parses the ShellLinkHeader and its LinkFlags-gated optional structures.
 * @param {ArrayBuffer} buffer Raw contents of a Windows shortcut file.
 * @returns {object} A display-friendly parsed shortcut model.
 */
export function parseLnk(buffer) {
  if (!(buffer instanceof ArrayBuffer)) throw new TypeError('Expected an ArrayBuffer.');
  const view = new DataView(buffer);
  required(view, 0, HEADER_SIZE, 'ShellLinkHeader');
  const headerSize = view.getUint32(0, true);
  if (headerSize !== HEADER_SIZE) {
    throw new Error(`Invalid HeaderSize: expected 0x4c, found ${hex(headerSize)}.`);
  }
  const clsid = clsidFromBytes(new Uint8Array(buffer, 4, 16));
  if (clsid !== SHELL_LINK_CLSID) {
    throw new Error(`Invalid LinkCLSID: expected ${SHELL_LINK_CLSID}.`);
  }
  const flags = view.getUint32(20, true);
  const attributes = view.getUint32(24, true);
  let cursor = HEADER_SIZE;
  let targetIdList = null;
  if (flags & 1) {
    required(view, cursor, 2, 'LinkTargetIDList size');
    const size = view.getUint16(cursor, true);
    required(view, cursor + 2, size, 'LinkTargetIDList');
    targetIdList = { size };
    cursor += 2 + size;
  }
  let linkInfo = null;
  if (flags & 2) {
    linkInfo = parseLinkInfo(view, cursor);
    cursor = linkInfo.nextOffset;
    delete linkInfo.nextOffset;
  }
  const stringData = parseStringData(view, cursor, flags);
  return {
    header: {
      headerSize: hex(headerSize), clsid, linkFlags: enabledFlags(flags, LINK_FLAGS),
      fileAttributes: enabledFlags(attributes, FILE_ATTRIBUTES),
      creationTime: filetimeToIso(view.getBigUint64(28, true)),
      accessTime: filetimeToIso(view.getBigUint64(36, true)),
      writeTime: filetimeToIso(view.getBigUint64(44, true)),
      fileSize: view.getUint32(52, true), iconIndex: view.getInt32(56, true),
      showCommand: SHOW_COMMANDS[view.getUint32(60, true)]
        ?? `Unknown (${view.getUint32(60, true)})`,
      hotkey: `0x${view.getUint16(64, true).toString(16).padStart(4, '0')}`,
    },
    targetIdList,
    linkInfo,
    stringData: stringData.strings,
    stringEncoding: stringData.encoding,
  };
}
