const Z85_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#";
const Z85_LOOKUP = new Map(
  [...Z85_ALPHABET].map((character, index) => [character, index]),
);

/**
 * Converts a hexadecimal byte string into bytes. Whitespace, commas, and `0x` prefixes are allowed.
 * @param {string} value - Hexadecimal bytes to parse.
 * @returns {Uint8Array} The parsed bytes.
 */
export function parseByteInput(value) {
  if (typeof value !== "string")
    throw new TypeError("Byte input must be a string.");
  const normalized = value.replace(/0x/gi, "").replace(/[\s,]+/g, "");
  if (normalized.length === 0) return new Uint8Array();
  if (normalized.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(normalized)) {
    throw new Error(
      "Enter bytes as complete hexadecimal pairs, for example: 86 4F D2 6F.",
    );
  }
  return Uint8Array.from(normalized.match(/../g), (pair) =>
    Number.parseInt(pair, 16),
  );
}

/**
 * Formats bytes as uppercase hexadecimal pairs separated by spaces.
 * @param {Uint8Array} bytes - Bytes to format.
 * @returns {string} Readable hexadecimal byte string.
 */
export function formatByteOutput(bytes) {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
}

/**
 * Appends zero bytes until the length is a multiple of four.
 * @param {Uint8Array} bytes - Bytes to align.
 * @returns {Uint8Array} Aligned bytes.
 */
export function padBytesToZ85Block(bytes) {
  const padding = (4 - (bytes.length % 4)) % 4;
  if (padding === 0) return bytes;
  const padded = new Uint8Array(bytes.length + padding);
  padded.set(bytes);
  return padded;
}

/**
 * Encodes binary data with the ZeroMQ Z85 alphabet.
 * @param {Uint8Array} bytes - A byte array whose length is a multiple of four.
 * @returns {string} Z85-encoded text.
 */
export function encodeZ85(bytes) {
  if (!(bytes instanceof Uint8Array))
    throw new TypeError("Z85 input must be a Uint8Array.");
  if (bytes.length % 4 !== 0) {
    throw new Error(
      "Z85 encoding requires a byte length that is a multiple of 4.",
    );
  }
  let output = "";
  for (let offset = 0; offset < bytes.length; offset += 4) {
    let value =
      bytes[offset] * 0x1000000 +
      (bytes[offset + 1] << 16) +
      (bytes[offset + 2] << 8) +
      bytes[offset + 3];
    const characters = Array(5);
    for (let index = 4; index >= 0; index -= 1) {
      characters[index] = Z85_ALPHABET[value % 85];
      value = Math.floor(value / 85);
    }
    output += characters.join("");
  }
  return output;
}

/**
 * Decodes ZeroMQ Z85 text into binary data.
 * @param {string} value - Z85 text with a length that is a multiple of five.
 * @returns {Uint8Array} Decoded bytes.
 */
export function decodeZ85(value) {
  if (typeof value !== "string")
    throw new TypeError("Z85 input must be a string.");
  if (value.length % 5 !== 0) {
    throw new Error(
      "Z85 decoding requires a character length that is a multiple of 5.",
    );
  }
  const bytes = new Uint8Array((value.length / 5) * 4);
  for (let offset = 0; offset < value.length; offset += 5) {
    let number = 0;
    for (let index = 0; index < 5; index += 1) {
      const digit = Z85_LOOKUP.get(value[offset + index]);
      if (digit === undefined)
        throw new Error(`Invalid Z85 character: ${value[offset + index]}.`);
      number = number * 85 + digit;
    }
    if (number > 0xffffffff) throw new Error("Invalid Z85 block value.");
    const byteOffset = (offset / 5) * 4;
    bytes[byteOffset] = Math.floor(number / 0x1000000);
    bytes[byteOffset + 1] = (number >>> 16) & 0xff;
    bytes[byteOffset + 2] = (number >>> 8) & 0xff;
    bytes[byteOffset + 3] = number & 0xff;
  }
  return bytes;
}
