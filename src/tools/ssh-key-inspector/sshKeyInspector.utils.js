const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true });

const KEY_DETAILS = {
  'ssh-rsa': { label: 'RSA' },
  'ssh-ed25519': { label: 'ED25519', bitSize: 256 },
  'ssh-dss': { label: 'DSA' },
  'ecdsa-sha2-nistp256': { label: 'ECDSA (nistp256)', curve: 'nistp256', bitSize: 256 },
  'ecdsa-sha2-nistp384': { label: 'ECDSA (nistp384)', curve: 'nistp384', bitSize: 384 },
  'ecdsa-sha2-nistp521': { label: 'ECDSA (nistp521)', curve: 'nistp521', bitSize: 521 },
};

const CURVE_POINT_LENGTHS = { nistp256: 65, nistp384: 97, nistp521: 133 };

function safeAdd(x, y) {
  const low = (x & 0xffff) + (y & 0xffff);
  const high = (x >> 16) + (y >> 16) + (low >> 16);
  return (high << 16) | (low & 0xffff);
}

function rotateLeft(value, amount) {
  return (value << amount) | (value >>> (32 - amount));
}

function md5Common(q, a, b, x, shift, constant) {
  return safeAdd(rotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, constant)), shift), b);
}

function md5Ff(a, b, c, d, x, shift, constant) {
  return md5Common((b & c) | (~b & d), a, b, x, shift, constant);
}

function md5Gg(a, b, c, d, x, shift, constant) {
  return md5Common((b & d) | (c & ~d), a, b, x, shift, constant);
}

function md5Hh(a, b, c, d, x, shift, constant) {
  return md5Common(b ^ c ^ d, a, b, x, shift, constant);
}

function md5Ii(a, b, c, d, x, shift, constant) {
  return md5Common(c ^ (b | ~d), a, b, x, shift, constant);
}

function md5Cycle(state, block) {
  let [a, b, c, d] = state;
  const k = block;
  a = md5Ff(a, b, c, d, k[0], 7, -680876936); d = md5Ff(d, a, b, c, k[1], 12, -389564586);
  c = md5Ff(c, d, a, b, k[2], 17, 606105819); b = md5Ff(b, c, d, a, k[3], 22, -1044525330);
  a = md5Ff(a, b, c, d, k[4], 7, -176418897); d = md5Ff(d, a, b, c, k[5], 12, 1200080426);
  c = md5Ff(c, d, a, b, k[6], 17, -1473231341); b = md5Ff(b, c, d, a, k[7], 22, -45705983);
  a = md5Ff(a, b, c, d, k[8], 7, 1770035416); d = md5Ff(d, a, b, c, k[9], 12, -1958414417);
  c = md5Ff(c, d, a, b, k[10], 17, -42063); b = md5Ff(b, c, d, a, k[11], 22, -1990404162);
  a = md5Ff(a, b, c, d, k[12], 7, 1804603682); d = md5Ff(d, a, b, c, k[13], 12, -40341101);
  c = md5Ff(c, d, a, b, k[14], 17, -1502002290); b = md5Ff(b, c, d, a, k[15], 22, 1236535329);
  a = md5Gg(a, b, c, d, k[1], 5, -165796510); d = md5Gg(d, a, b, c, k[6], 9, -1069501632);
  c = md5Gg(c, d, a, b, k[11], 14, 643717713); b = md5Gg(b, c, d, a, k[0], 20, -373897302);
  a = md5Gg(a, b, c, d, k[5], 5, -701558691); d = md5Gg(d, a, b, c, k[10], 9, 38016083);
  c = md5Gg(c, d, a, b, k[15], 14, -660478335); b = md5Gg(b, c, d, a, k[4], 20, -405537848);
  a = md5Gg(a, b, c, d, k[9], 5, 568446438); d = md5Gg(d, a, b, c, k[14], 9, -1019803690);
  c = md5Gg(c, d, a, b, k[3], 14, -187363961); b = md5Gg(b, c, d, a, k[8], 20, 1163531501);
  a = md5Gg(a, b, c, d, k[13], 5, -1444681467); d = md5Gg(d, a, b, c, k[2], 9, -51403784);
  c = md5Gg(c, d, a, b, k[7], 14, 1735328473); b = md5Gg(b, c, d, a, k[12], 20, -1926607734);
  a = md5Hh(a, b, c, d, k[5], 4, -378558); d = md5Hh(d, a, b, c, k[8], 11, -2022574463);
  c = md5Hh(c, d, a, b, k[11], 16, 1839030562); b = md5Hh(b, c, d, a, k[14], 23, -35309556);
  a = md5Hh(a, b, c, d, k[1], 4, -1530992060); d = md5Hh(d, a, b, c, k[4], 11, 1272893353);
  c = md5Hh(c, d, a, b, k[7], 16, -155497632); b = md5Hh(b, c, d, a, k[10], 23, -1094730640);
  a = md5Hh(a, b, c, d, k[13], 4, 681279174); d = md5Hh(d, a, b, c, k[0], 11, -358537222);
  c = md5Hh(c, d, a, b, k[3], 16, -722521979); b = md5Hh(b, c, d, a, k[6], 23, 76029189);
  a = md5Hh(a, b, c, d, k[9], 4, -640364487); d = md5Hh(d, a, b, c, k[12], 11, -421815835);
  c = md5Hh(c, d, a, b, k[15], 16, 530742520); b = md5Hh(b, c, d, a, k[2], 23, -995338651);
  a = md5Ii(a, b, c, d, k[0], 6, -198630844); d = md5Ii(d, a, b, c, k[7], 10, 1126891415);
  c = md5Ii(c, d, a, b, k[14], 15, -1416354905); b = md5Ii(b, c, d, a, k[5], 21, -57434055);
  a = md5Ii(a, b, c, d, k[12], 6, 1700485571); d = md5Ii(d, a, b, c, k[3], 10, -1894986606);
  c = md5Ii(c, d, a, b, k[10], 15, -1051523); b = md5Ii(b, c, d, a, k[1], 21, -2054922799);
  a = md5Ii(a, b, c, d, k[8], 6, 1873313359); d = md5Ii(d, a, b, c, k[15], 10, -30611744);
  c = md5Ii(c, d, a, b, k[6], 15, -1560198380); b = md5Ii(b, c, d, a, k[13], 21, 1309151649);
  a = md5Ii(a, b, c, d, k[4], 6, -145523070); d = md5Ii(d, a, b, c, k[11], 10, -1120210379);
  c = md5Ii(c, d, a, b, k[2], 15, 718787259); b = md5Ii(b, c, d, a, k[9], 21, -343485551);
  state[0] = safeAdd(a, state[0]); state[1] = safeAdd(b, state[1]);
  state[2] = safeAdd(c, state[2]); state[3] = safeAdd(d, state[3]);
}

function md5(bytes) {
  const bitLength = bytes.length * 8;
  let paddedLength = bytes.length + 1;
  while (paddedLength % 64 !== 56) paddedLength += 1;
  const padded = new Uint8Array(paddedLength + 8);
  padded.set(bytes); padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLength >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bitLength / 0x100000000), true);
  const state = Int32Array.from([1732584193, -271733879, -1732584194, 271733878]);
  for (let offset = 0; offset < padded.length; offset += 64) {
    const block = new Int32Array(16);
    for (let index = 0; index < 16; index += 1) {
      block[index] = view.getInt32(offset + index * 4, true);
    }
    md5Cycle(state, block);
  }
  const digest = new Uint8Array(16);
  const digestView = new DataView(digest.buffer);
  for (let index = 0; index < 4; index += 1) {
    digestView.setInt32(index * 4, state[index], true);
  }
  return digest;
}

function bytesToText(bytes) {
  return TEXT_DECODER.decode(bytes);
}

function base64ToBytes(value) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error('The public-key blob is not valid Base64.');
  }
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function readField(bytes, offset) {
  if (offset + 4 > bytes.length) {
    throw new Error('The SSH wire data is truncated before a field length.');
  }
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
  const start = offset + 4;
  const end = start + length;
  if (end > bytes.length) throw new Error('A declared SSH field length exceeds the decoded blob.');
  return { value: bytes.subarray(start, end), nextOffset: end };
}

function readTextField(bytes, offset) {
  const field = readField(bytes, offset);
  return { value: bytesToText(field.value), nextOffset: field.nextOffset };
}

function positiveMpintBits(bytes, name) {
  if (bytes.length === 0) throw new Error(`The ${name} mpint must be positive.`);
  if (bytes[0] & 0x80) throw new Error(`The ${name} mpint is negative.`);
  if (bytes.length > 1 && bytes[0] === 0 && !(bytes[1] & 0x80)) {
    throw new Error(`The ${name} mpint is not minimally encoded.`);
  }
  const firstValueIndex = bytes.findIndex((value) => value !== 0);
  if (firstValueIndex === -1) throw new Error(`The ${name} mpint must be positive.`);
  const first = bytes[firstValueIndex];
  return (bytes.length - firstValueIndex - 1) * 8 + (32 - Math.clz32(first));
}

function readPositiveMpint(bytes, offset, name) {
  const field = readField(bytes, offset);
  return {
    bitSize: positiveMpintBits(field.value, name),
    nextOffset: field.nextOffset,
  };
}

function parsePublicKeyLine(line) {
  if (typeof line !== 'string' || line.trim() === '') {
    throw new Error('Enter an OpenSSH public key line.');
  }
  if (/PRIVATE\s+KEY/i.test(line)) {
    throw new Error('Private keys are not supported. Paste a public key line.');
  }
  const parts = line.trim().split(/\s+/);
  if (parts.length < 2) throw new Error('Expected "key-type base64-blob [comment]".');
  const [declaredType, blobText, ...commentParts] = parts;
  return { declaredType, blobText, comment: commentParts.join(' ') };
}

/**
 * Decodes one OpenSSH public-key line without throwing for malformed input.
 * @param {string} line - An authorized_keys-style public-key line.
 * @returns {object} Decoded metadata and bytes, or an object containing an error.
 */
export function decodeOpenSshPublicKey(line) {
  try {
    const { declaredType, blobText, comment } = parsePublicKeyLine(line);
    if (!KEY_DETAILS[declaredType]) {
      return { error: `Unsupported SSH key type: ${declaredType}.` };
    }
    const blobBytes = base64ToBytes(blobText);
    const typeField = readTextField(blobBytes, 0);
    if (typeField.value !== declaredType) {
      return {
        error: `Key type mismatch: line says ${declaredType}, blob says ${typeField.value}.`,
      };
    }
    let offset = typeField.nextOffset;
    const details = KEY_DETAILS[declaredType];
    let bitSize = details.bitSize;
    const curve = details.curve;
    if (declaredType === 'ssh-rsa') {
      const exponent = readPositiveMpint(blobBytes, offset, 'RSA exponent');
      const modulus = readPositiveMpint(blobBytes, exponent.nextOffset, 'RSA modulus');
      bitSize = modulus.bitSize;
      offset = modulus.nextOffset;
    } else if (declaredType === 'ssh-dss') {
      const prime = readPositiveMpint(blobBytes, offset, 'DSA prime');
      const subgroup = readPositiveMpint(blobBytes, prime.nextOffset, 'DSA subgroup');
      const generator = readPositiveMpint(blobBytes, subgroup.nextOffset, 'DSA generator');
      const publicValue = readPositiveMpint(blobBytes, generator.nextOffset, 'DSA public value');
      bitSize = prime.bitSize;
      offset = publicValue.nextOffset;
    } else if (declaredType === 'ssh-ed25519') {
      const point = readField(blobBytes, offset);
      if (point.value.length !== 32) {
        return { error: 'An ssh-ed25519 public point must be 32 bytes.' };
      }
      offset = point.nextOffset;
    } else {
      const curveField = readTextField(blobBytes, offset);
      if (curveField.value !== curve) return { error: `ECDSA curve must be ${curve}.` };
      const point = readField(blobBytes, curveField.nextOffset);
      if (point.value.length !== CURVE_POINT_LENGTHS[curve] || point.value[0] !== 4) {
        return { error: `The ${curve} public point has an invalid length or encoding.` };
      }
      offset = point.nextOffset;
    }
    if (offset !== blobBytes.length) return { error: 'The SSH wire data has trailing bytes.' };
    return { blobBytes, keyType: declaredType, label: details.label, bitSize, curve, comment };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to decode this public key.' };
  }
}

/**
 * Computes ssh-keygen-compatible SHA-256 and MD5 fingerprints for a public-key blob.
 * @param {Uint8Array} blobBytes - The decoded SSH public-key wire blob.
 * @returns {Promise<{sha256: string, md5: string}>} The fingerprint strings.
 */
export async function computeFingerprints(blobBytes) {
  const sha256Digest = new Uint8Array(await crypto.subtle.digest('SHA-256', blobBytes));
  const sha256Base64 = btoa(String.fromCharCode(...sha256Digest))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  const md5Hex = Array.from(md5(blobBytes), (value) => value.toString(16).padStart(2, '0'))
    .join(':');
  return { sha256: `SHA256:${sha256Base64}`, md5: `MD5:${md5Hex}` };
}
