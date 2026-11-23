const SECTOR = 2048;

async function readSlice(file, offset, length) {
  if (offset + length > file.size) {
    throw new Error('Truncated input: descriptor extends beyond file.');
  }
  const bytes = new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
  if (bytes.length !== length) throw new Error('Truncated input while reading descriptor.');
  return bytes;
}

function tag(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const checksum = bytes.subarray(0, 16).reduce((sum, byte, index) => (
    index === 4 ? sum : sum + byte
  ), 0) & 0xff;
  if (checksum !== bytes[4]) throw new Error('Bad descriptor tag checksum.');
  return {
    identifier: view.getUint16(0, true),
    checksum: bytes[4],
    serial: view.getUint16(6, true),
    location: view.getUint32(12, true),
  };
}

function dstring(bytes) {
  const length = bytes[bytes.length - 1];
  if (length === 0) return '';
  if (length > bytes.length - 1) return '(invalid d-string)';
  const data = bytes.subarray(1, length);
  if (bytes[0] === 8) return Array.from(data, (byte) => String.fromCharCode(byte)).join('');
  if (bytes[0] === 16 && data.length % 2 === 0) {
    let result = '';
    for (let i = 0; i < data.length; i += 2) {
      result += String.fromCharCode((data[i] << 8) | data[i + 1]);
    }
    return result;
  }
  return '(unsupported d-string encoding)';
}

function timestamp(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pad = (value, width = 2) => String(value).padStart(width, '0');
  const zoneValue = view.getUint16(0, true) & 0xfff;
  const zone = zoneValue & 0x800 ? zoneValue - 0x1000 : zoneValue;
  const offset = zone === -2047 ? ' (timezone unspecified)' :
    ` ${zone < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(zone) / 60))}:${pad(Math.abs(zone) % 60)}`;
  return `${pad(view.getUint16(2, true), 4)}-${pad(bytes[4])}-${pad(bytes[5])} ` +
    `${pad(bytes[6])}:${pad(bytes[7])}:${pad(bytes[8])}.` +
    `${pad(bytes[9])}${pad(bytes[10])}${pad(bytes[11])}${offset}`;
}

/** Inspect the recognition sequence, anchor and main volume descriptors of a UDF image.
 * @param {Blob} file Image file to inspect using bounded slices.
 * @returns {Promise<object>} Parsed image metadata.
 */
export async function inspectUdf(file) {
  let bea = false;
  let nsr = '';
  let complete = false;
  for (let sector = 16; sector < 256; sector += 1) {
    const bytes = await readSlice(file, sector * SECTOR, 7);
    const id = String.fromCharCode(...bytes.subarray(1, 6));
    if (id === 'BEA01') { bea = true; nsr = ''; }
    else if (bea && (id === 'NSR02' || id === 'NSR03')) nsr = id;
    else if (bea && id === 'TEA01') { complete = Boolean(nsr); break; }
  }
  if (!complete) {
    throw new Error('Missing UDF recognition sequence (BEA01, NSR02/NSR03, TEA01).');
  }
  const anchorBytes = await readSlice(file, 256 * SECTOR, SECTOR);
  const anchor = tag(anchorBytes);
  if (anchor.identifier !== 2) {
    throw new Error('Invalid anchor descriptor tag identifier (expected 2).');
  }
  const anchorView = new DataView(anchorBytes.buffer);
  const extentLength = anchorView.getUint32(16, true);
  const extentLocation = anchorView.getUint32(20, true);
  if (extentLocation * SECTOR + extentLength > file.size) {
    throw new Error('Truncated input: main volume descriptor sequence extends beyond file.');
  }
  let primary = null;
  let revision = null;
  for (let offset = 0; offset + SECTOR <= extentLength; offset += SECTOR) {
    const bytes = await readSlice(file, extentLocation * SECTOR + offset, SECTOR);
    const descriptor = tag(bytes);
    if (descriptor.identifier === 8) break;
    if (descriptor.identifier === 1 && !primary) {
      primary = {
        volumeIdentifier: dstring(bytes.subarray(24, 56)),
        volumeSetIdentifier: dstring(bytes.subarray(72, 200)),
        recordingDateTime: timestamp(bytes.subarray(376, 388)),
      };
    }
    if (descriptor.identifier === 6) {
      const identifier = String.fromCharCode(...bytes.subarray(217, 240)).replace(/\0.*$/, '');
      if (identifier === '*OSTA UDF Compliant') {
        const value = new DataView(bytes.buffer).getUint16(240, true);
        revision = `${(value >> 8).toString(16)}.${(value & 0xff).toString(16).padStart(2, '0')}`;
      }
    }
  }
  if (extentLength % SECTOR !== 0) {
    throw new Error('Truncated input: incomplete descriptor sector.');
  }
  return { fileSize: file.size, nsr, anchor, extentLength, extentLocation, primary, revision };
}
