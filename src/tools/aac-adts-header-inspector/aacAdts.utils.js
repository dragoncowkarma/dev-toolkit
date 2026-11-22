const SAMPLING_FREQUENCIES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000,
  22050, 16000, 12000, 11025, 8000, 7350,
];

const OBJECT_TYPES = ['AAC Main', 'AAC LC', 'AAC SSR', 'AAC LTP'];

const CHANNEL_CONFIGURATIONS = {
  0: { count: null, label: 'Program Config Element (defined in stream)' },
  1: { count: 1, label: 'Mono' },
  2: { count: 2, label: 'Stereo' },
  3: { count: 3, label: '3 channels' },
  4: { count: 4, label: '4 channels' },
  5: { count: 5, label: '5 channels' },
  6: { count: 6, label: '5.1 channels' },
  7: { count: 8, label: '7.1 channels' },
};

function undecoded(message) {
  return { status: 'undecoded', message, frames: [] };
}

/**
 * Parses an AAC ADTS stream without decoding its audio payload.
 *
 * @param {ArrayBuffer | Uint8Array} input - Raw ADTS file contents.
 * @returns {{status: string, message?: string, frames: Array<object>}}
 */
export function parseAdtsStream(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 7) return undecoded('The file is too short to contain an ADTS header.');

  const frames = [];
  let offset = 0;

  while (offset < bytes.length) {
    const remaining = bytes.length - offset;
    if (remaining < 7) return undecoded(`Frame ${frames.length + 1} has a truncated ADTS header.`);

    const first = parseFrame(bytes, offset, frames.length + 1);
    if (first.status === 'undecoded') return first;
    frames.push(first.frame);
    offset += first.frame.frameLength;
  }

  return { status: 'decoded', frames };
}

function parseFrame(bytes, offset, frameNumber) {
  const byte0 = bytes[offset];
  const byte1 = bytes[offset + 1];
  const byte2 = bytes[offset + 2];
  const byte3 = bytes[offset + 3];
  const byte4 = bytes[offset + 4];
  const byte5 = bytes[offset + 5];
  const byte6 = bytes[offset + 6];

  if (byte0 !== 0xff || (byte1 & 0xf0) !== 0xf0) {
    return undecoded(`Frame ${frameNumber} does not begin with the ADTS syncword.`);
  }
  if ((byte1 & 0x06) !== 0) {
    return undecoded(`Frame ${frameNumber} has an unsupported non-zero ADTS layer.`);
  }

  const protectionAbsent = Boolean(byte1 & 0x01);
  const headerLength = protectionAbsent ? 7 : 9;
  if (bytes.length - offset < headerLength) {
    return undecoded(`Frame ${frameNumber} has a truncated ADTS header.`);
  }

  const samplingFrequencyIndex = (byte2 >> 2) & 0x0f;
  const samplingFrequency = SAMPLING_FREQUENCIES[samplingFrequencyIndex];
  if (!samplingFrequency) {
    return undecoded(`Frame ${frameNumber} has an invalid ADTS sampling-frequency index.`);
  }

  const profile = (byte2 >> 6) & 0x03;
  const channelConfiguration = ((byte2 & 0x01) << 2) | ((byte3 >> 6) & 0x03);
  const frameLength = ((byte3 & 0x03) << 11) | (byte4 << 3) | ((byte5 >> 5) & 0x07);
  if (frameLength < headerLength) {
    return undecoded(`Frame ${frameNumber} declares a length shorter than its header.`);
  }
  if (frameLength > bytes.length - offset) {
    return undecoded(`Frame ${frameNumber} is truncated: its declared length exceeds the file.`);
  }

  const channelInfo = CHANNEL_CONFIGURATIONS[channelConfiguration];
  return {
    status: 'decoded',
    frame: {
      number: frameNumber,
      offset,
      mpegVersion: (byte1 & 0x08) === 0 ? 'MPEG-4' : 'MPEG-2',
      layer: 0,
      protectionAbsent,
      objectType: profile + 1,
      profile: OBJECT_TYPES[profile],
      samplingFrequencyIndex,
      samplingFrequency,
      channelConfiguration,
      channelCount: channelInfo.count,
      channelLayout: channelInfo.label,
      frameLength,
      bufferFullness: ((byte5 & 0x1f) << 6) | ((byte6 >> 2) & 0x3f),
      rawDataBlocks: byte6 & 0x03,
    },
  };
}
