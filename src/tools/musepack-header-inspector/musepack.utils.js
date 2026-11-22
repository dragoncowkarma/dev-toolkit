const SAMPLE_RATES = [44100, 48000, 37800, 32000];

function readVariable(bytes, position, end) {
  let value = 0n;
  for (let count = 0; count < 9; count += 1) {
    if (position >= end) throw new Error('Truncated variable-length field.');
    const byte = bytes[position++];
    value = (value << 7n) | BigInt(byte & 127);
    if (!(byte & 128)) return { value, position };
  }
  throw new Error('Variable-length field exceeds nine bytes.');
}

function readHeader(bytes, start, end) {
  if (end - start < 5) throw new Error('Truncated SH header.');
  const crc = ((bytes[start] * 0x1000000) + (bytes[start + 1] << 16) +
    (bytes[start + 2] << 8) + bytes[start + 3]).toString(16).padStart(8, '0');
  const version = bytes[start + 4];
  if (version !== 8) throw new Error('Unsupported Musepack stream version.');
  const samples = readVariable(bytes, start + 5, end);
  const silence = readVariable(bytes, samples.position, end);
  if (end - silence.position < 2) throw new Error('Truncated SH fields.');
  const first = bytes[silence.position];
  const second = bytes[silence.position + 1];
  const sampleRateIndex = first >> 5;
  const blockPower = second & 7;
  return {
    crc, version, sampleCount: samples.value.toString(),
    beginningSilence: silence.value.toString(), sampleRateIndex,
    sampleRate: SAMPLE_RATES[sampleRateIndex] ?? null,
    maxUsedBands: (first & 31) + 1, channels: (second >> 4) + 1,
    midSide: Boolean(second & 8), audioBlockFrames: 4 ** blockPower,
  };
}

/** Parse a Musepack SV8 byte stream without accessing browser APIs. */
export function parseMusepack(bytes) {
  try {
    if (!(bytes instanceof Uint8Array)) throw new Error('Expected a byte buffer.');
    if (bytes.length < 4) throw new Error('Truncated Musepack magic.');
    if (bytes[0] !== 77 || bytes[1] !== 80 || bytes[2] !== 67 || bytes[3] !== 75) {
      throw new Error('Invalid Musepack magic; expected MPCK.');
    }
    let position = 4;
    let header = null;
    const packets = [];
    while (position < bytes.length) {
      const start = position;
      if (bytes.length - position < 2) throw new Error('Truncated packet key.');
      const key = String.fromCharCode(bytes[position], bytes[position + 1]);
      position += 2;
      const sizeField = readVariable(bytes, position, bytes.length);
      position = sizeField.position;
      if (sizeField.value < BigInt(position - start)) throw new Error('Invalid packet size.');
      if (sizeField.value > BigInt(bytes.length - start)) throw new Error('Truncated packet.');
      const size = Number(sizeField.value);
      const end = start + size;
      packets.push({ key, size });
      if (key === 'SH') header = readHeader(bytes, position, end);
      position = end;
      if (key === 'SE') break;
    }
    if (!header) throw new Error('Missing SH stream header.');
    return { ok: true, header, packets };
  } catch (error) {
    return { ok: false, error: error.message || 'Unable to parse Musepack stream.' };
  }
}

/** Decode pasted hexadecimal or Base64 data into bytes. */
export function decodeBytes(input, format) {
  const clean = input.replace(/\s/g, '');
  if (!clean) throw new Error('Enter bytes to inspect.');
  if (format === 'hex') {
    if (clean.length % 2 || !/^[0-9a-f]+$/i.test(clean)) throw new Error('Invalid hex input.');
    return Uint8Array.from(clean.match(/../g), (pair) => parseInt(pair, 16));
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(clean)) {
    throw new Error('Invalid Base64 input.');
  }
  try {
    return Uint8Array.from(atob(clean), (char) => char.charCodeAt(0));
  } catch {
    throw new Error('Invalid Base64 input.');
  }
}
