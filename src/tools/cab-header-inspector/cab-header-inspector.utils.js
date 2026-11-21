const FLAG_PREV_CABINET = 0x0001;
const FLAG_NEXT_CABINET = 0x0002;
const FLAG_RESERVE_PRESENT = 0x0004;
const FLAG_UTF8_NAMES = 0x0080;

function requireBytes(view, offset, length, label) {
  if (!Number.isSafeInteger(offset) || offset < 0 || length > view.byteLength - offset) {
    throw new Error(`Truncated CAB: ${label} needs ${length} byte(s) at offset ${offset}.`);
  }
}

function readUint8(view, offset, label) {
  requireBytes(view, offset, 1, label);
  return view.getUint8(offset);
}

function readUint16(view, offset, label) {
  requireBytes(view, offset, 2, label);
  return view.getUint16(offset, true);
}

function readUint32(view, offset, label) {
  requireBytes(view, offset, 4, label);
  return view.getUint32(offset, true);
}

function readNullTerminatedString(view, offset, label, isUtf8) {
  requireBytes(view, offset, 1, label);
  let end = offset;
  while (end < view.byteLength && view.getUint8(end) !== 0) end += 1;
  if (end === view.byteLength) {
    throw new Error(`Truncated CAB: ${label} is missing its null terminator.`);
  }
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, end - offset);
  try {
    if (!isUtf8 && bytes.some((byte) => byte > 0x7f)) {
      throw new Error('Non-ASCII byte');
    }
    return {
      value: new TextDecoder(isUtf8 ? 'utf-8' : 'ascii', { fatal: true }).decode(bytes),
      nextOffset: end + 1,
    };
  } catch {
    throw new Error(`Invalid ${isUtf8 ? 'UTF-8' : 'ASCII'} text in ${label}.`);
  }
}

function formatDosDateTime(date, time) {
  const day = date & 0x1f;
  const month = (date >> 5) & 0x0f;
  const year = 1980 + (date >> 9);
  const second = (time & 0x1f) * 2;
  const minute = (time >> 5) & 0x3f;
  const hour = (time >> 11) & 0x1f;
  if (
    month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 58
  ) {
    return 'Invalid DOS date/time';
  }
  const dateText = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-` +
    String(day).padStart(2, '0');
  const timeText = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:` +
    String(second).padStart(2, '0');
  return `${dateText} ${timeText}`;
}

function compressionName(typeCompress) {
  const types = { 0: 'None', 1: 'MSZIP', 2: 'Quantum', 3: 'LZX' };
  return types[typeCompress & 0x000f] ?? 'Unknown';
}

/**
 * Parses the non-payload structures of a Microsoft Cabinet archive.
 * @param {ArrayBuffer} buffer - CAB file bytes.
 * @returns {object} Parsed CFHEADER, CFFOLDER, and CFFILE metadata.
 */
export function parseCabHeader(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('CAB data must be an ArrayBuffer.');
  }
  const view = new DataView(buffer);
  requireBytes(view, 0, 36, 'CFHEADER');
  const signature = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (signature !== 'MSCF') throw new Error('Invalid CAB signature: expected MSCF.');

  const header = {
    signature,
    reserved1: readUint32(view, 4, 'CFHEADER.reserved1'),
    cbCabinet: readUint32(view, 8, 'CFHEADER.cbCabinet'),
    reserved2: readUint32(view, 12, 'CFHEADER.reserved2'),
    coffFiles: readUint32(view, 16, 'CFHEADER.coffFiles'),
    reserved3: readUint32(view, 20, 'CFHEADER.reserved3'),
    versionMinor: readUint8(view, 24, 'CFHEADER.versionMinor'),
    versionMajor: readUint8(view, 25, 'CFHEADER.versionMajor'),
    cFolders: readUint16(view, 26, 'CFHEADER.cFolders'),
    cFiles: readUint16(view, 28, 'CFHEADER.cFiles'),
    flags: readUint16(view, 30, 'CFHEADER.flags'),
    setID: readUint16(view, 32, 'CFHEADER.setID'),
    iCabinet: readUint16(view, 34, 'CFHEADER.iCabinet'),
  };
  if (header.cbCabinet > view.byteLength) {
    throw new Error(
      `Truncated CAB: cbCabinet is ${header.cbCabinet}, but only ${view.byteLength} bytes exist.`
    );
  }
  if (header.coffFiles > view.byteLength) {
    throw new Error(`Invalid CAB: coffFiles ${header.coffFiles} is beyond the file length.`);
  }

  let offset = 36;
  let folderReservedSize = 0;
  const reserved = { headerSize: 0, folderSize: 0, dataSize: 0 };
  if (header.flags & FLAG_RESERVE_PRESENT) {
    reserved.headerSize = readUint16(view, offset, 'CFHEADER.cbCFHeader');
    folderReservedSize = readUint8(view, offset + 2, 'CFHEADER.cbCFFolder');
    reserved.folderSize = folderReservedSize;
    reserved.dataSize = readUint8(view, offset + 3, 'CFHEADER.cbCFData');
    offset += 4;
    requireBytes(view, offset, reserved.headerSize, 'per-cabinet reserved area');
    offset += reserved.headerSize;
  }

  const usesUtf8Names = Boolean(header.flags & FLAG_UTF8_NAMES);
  const textEncoding = usesUtf8Names ? 'UTF-8' : 'ASCII';
  const links = {};
  if (header.flags & FLAG_PREV_CABINET) {
    const cabinet = readNullTerminatedString(
      view, offset, 'previous cabinet name', usesUtf8Names
    );
    const disk = readNullTerminatedString(
      view, cabinet.nextOffset, 'previous disk name', usesUtf8Names
    );
    links.previousCabinet = cabinet.value;
    links.previousDisk = disk.value;
    offset = disk.nextOffset;
  }
  if (header.flags & FLAG_NEXT_CABINET) {
    const cabinet = readNullTerminatedString(view, offset, 'next cabinet name', usesUtf8Names);
    const disk = readNullTerminatedString(
      view, cabinet.nextOffset, 'next disk name', usesUtf8Names
    );
    links.nextCabinet = cabinet.value;
    links.nextDisk = disk.value;
    offset = disk.nextOffset;
  }

  const folders = [];
  for (let index = 0; index < header.cFolders; index += 1) {
    requireBytes(view, offset, 8 + folderReservedSize, `CFFOLDER ${index}`);
    const typeCompress = readUint16(view, offset + 6, `CFFOLDER ${index}.typeCompress`);
    folders.push({
      coffCabStart: readUint32(view, offset, `CFFOLDER ${index}.coffCabStart`),
      cCFData: readUint16(view, offset + 4, `CFFOLDER ${index}.cCFData`),
      typeCompress,
      compression: compressionName(typeCompress),
    });
    offset += 8 + folderReservedSize;
  }

  if (header.coffFiles < offset) {
    throw new Error('Invalid CAB: coffFiles points before the CFFOLDER table.');
  }

  offset = header.coffFiles;
  const files = [];
  for (let index = 0; index < header.cFiles; index += 1) {
    requireBytes(view, offset, 16, `CFFILE ${index}`);
    const date = readUint16(view, offset + 10, `CFFILE ${index}.date`);
    const time = readUint16(view, offset + 12, `CFFILE ${index}.time`);
    const name = readNullTerminatedString(
      view, offset + 16, `CFFILE ${index}.name`, usesUtf8Names
    );
    files.push({
      cbFile: readUint32(view, offset, `CFFILE ${index}.cbFile`),
      uoffFolderStart: readUint32(view, offset + 4, `CFFILE ${index}.uoffFolderStart`),
      iFolder: readUint16(view, offset + 8, `CFFILE ${index}.iFolder`),
      date,
      time,
      modified: formatDosDateTime(date, time),
      attribs: readUint16(view, offset + 14, `CFFILE ${index}.attribs`),
      name: name.value,
    });
    offset = name.nextOffset;
  }

  return { header, reserved, links, folders, files, nameEncoding: textEncoding };
}
