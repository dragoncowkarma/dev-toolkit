const NETPBM_MAGIC = /^P[1-7]$/;
const ASCII_VARIANTS = new Set(["P1", "P2", "P3"]);
const BITMAP_VARIANTS = new Set(["P1", "P4"]);
const BINARY_VARIANTS = new Set(["P4", "P5", "P6"]);

function unavailable(error) {
  return { valid: false, error, fields: null };
}

function isWhitespace(byte) {
  return (
    byte === 9 ||
    byte === 10 ||
    byte === 11 ||
    byte === 12 ||
    byte === 13 ||
    byte === 32
  );
}

function readToken(bytes, start) {
  let index = start;
  while (index < bytes.length) {
    if (isWhitespace(bytes[index])) {
      index += 1;
    } else if (bytes[index] === 35) {
      while (index < bytes.length && bytes[index] !== 10 && bytes[index] !== 13)
        index += 1;
    } else {
      break;
    }
  }
  const tokenStart = index;
  while (
    index < bytes.length &&
    !isWhitespace(bytes[index]) &&
    bytes[index] !== 35
  )
    index += 1;
  if (tokenStart === index) return null;
  return {
    value: new TextDecoder("ascii").decode(bytes.slice(tokenStart, index)),
    end: index,
  };
}

function readPositiveInteger(token, field) {
  if (!/^\d+$/.test(token))
    return { error: `${field} must be a positive integer.` };
  const value = Number(token);
  if (!Number.isSafeInteger(value) || value <= 0) {
    return { error: `${field} must be a positive integer.` };
  }
  return { value };
}

function payloadSize(width, height, channels, bitsPerSample, packedBits) {
  const samples = width * height * channels;
  const bytes = packedBits
    ? Math.ceil(width / 8) * height
    : samples * (bitsPerSample / 8);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

function parseClassic(bytes) {
  const magicToken = readToken(bytes, 0);
  if (
    !magicToken ||
    !NETPBM_MAGIC.test(magicToken.value) ||
    magicToken.value === "P7"
  ) {
    return unavailable(
      "Input does not begin with a supported Netpbm magic number.",
    );
  }
  const magic = magicToken.value;
  const widthToken = readToken(bytes, magicToken.end);
  const heightToken = widthToken && readToken(bytes, widthToken.end);
  if (!widthToken || !heightToken)
    return unavailable("Header is truncated before width or height.");
  const width = readPositiveInteger(widthToken.value, "Width");
  const height = readPositiveInteger(heightToken.value, "Height");
  if (width.error || height.error)
    return unavailable(width.error ?? height.error);

  const hasMaxval = !BITMAP_VARIANTS.has(magic);
  const maxvalToken = hasMaxval && readToken(bytes, heightToken.end);
  if (hasMaxval && !maxvalToken)
    return unavailable("Header is truncated before MAXVAL.");
  const maxval = hasMaxval
    ? readPositiveInteger(maxvalToken.value, "MAXVAL")
    : { value: null };
  if (maxval.error || (maxval.value !== null && maxval.value > 65535)) {
    return unavailable(maxval.error ?? "MAXVAL must not exceed 65535.");
  }

  const lastTokenEnd = hasMaxval ? maxvalToken.end : heightToken.end;
  const raw = BINARY_VARIANTS.has(magic);
  if (
    raw &&
    (lastTokenEnd >= bytes.length || !isWhitespace(bytes[lastTokenEnd]))
  ) {
    return unavailable(
      "Binary Netpbm headers require whitespace before pixel data.",
    );
  }
  const headerByteLength = raw ? lastTokenEnd + 1 : lastTokenEnd;
  const channels = BITMAP_VARIANTS.has(magic)
    ? 1
    : magic === "P3" || magic === "P6"
      ? 3
      : 1;
  const bitsPerSample = BITMAP_VARIANTS.has(magic)
    ? 1
    : maxval.value > 255
      ? 16
      : 8;
  const expectedPayloadSize = raw
    ? payloadSize(width.value, height.value, channels, bitsPerSample, magic === "P4")
    : null;
  const family = BITMAP_VARIANTS.has(magic)
    ? "PBM"
    : magic === "P2" || magic === "P5"
      ? "PGM"
      : "PPM";
  return {
    valid: true,
    error: "",
    fields: {
      magic,
      variant: `${magic} ${family}`,
      encoding: ASCII_VARIANTS.has(magic) ? "ASCII" : "Raw binary",
      width: width.value,
      height: height.value,
      maxval: maxval.value,
      channels,
      bitsPerSample,
      headerByteLength,
      expectedPayloadSize,
      availablePayloadSize: raw
        ? Math.max(0, bytes.length - headerByteLength)
        : null,
    },
  };
}

function parsePam(bytes) {
  const newline = bytes.indexOf(10);
  if (
    newline < 0 ||
    new TextDecoder("ascii").decode(bytes.slice(0, newline)).trim() !== "P7"
  ) {
    return unavailable("PAM headers must start with P7 followed by a newline.");
  }
  const decoder = new TextDecoder("ascii");
  const values = {};
  let lineStart = newline + 1;
  while (lineStart <= bytes.length) {
    const lineEnd = bytes.indexOf(10, lineStart);
    if (lineEnd < 0)
      return unavailable("PAM header is truncated before ENDHDR.");
    const line = decoder
      .decode(bytes.slice(lineStart, lineEnd))
      .replace(/\r$/, "");
    if (line === "ENDHDR") {
      const width = readPositiveInteger(values.WIDTH ?? "", "WIDTH");
      const height = readPositiveInteger(values.HEIGHT ?? "", "HEIGHT");
      const depth = readPositiveInteger(values.DEPTH ?? "", "DEPTH");
      const maxval = readPositiveInteger(values.MAXVAL ?? "", "MAXVAL");
      if (
        width.error ||
        height.error ||
        depth.error ||
        maxval.error ||
        maxval.value > 65535
      ) {
        return unavailable(
          width.error ??
            height.error ??
            depth.error ??
            maxval.error ??
            "MAXVAL is invalid.",
        );
      }
      const headerByteLength = lineEnd + 1;
      const bitsPerSample = maxval.value > 255 ? 16 : 8;
      const expectedPayloadSize = payloadSize(
        width.value,
        height.value,
        depth.value,
        bitsPerSample,
        false,
      );
      return {
        valid: true,
        error: "",
        fields: {
          magic: "P7",
          variant: "P7 PAM",
          encoding: "Raw binary",
          width: width.value,
          height: height.value,
          maxval: maxval.value,
          channels: depth.value,
          bitsPerSample,
          tupleType: values.TUPLTYPE || null,
          headerByteLength,
          expectedPayloadSize,
          availablePayloadSize: Math.max(0, bytes.length - headerByteLength),
        },
      };
    }
    const [key, ...rest] = line.trim().split(/\s+/);
    if (key && !key.startsWith("#") && rest.length > 0)
      values[key] = rest.join(" ");
    lineStart = lineEnd + 1;
  }
  return unavailable("PAM header is truncated before ENDHDR.");
}

/**
 * Parses a Netpbm header without reading or decoding its pixels.
 * @param {Uint8Array} bytes Image bytes.
 * @returns {{valid: boolean, error: string, fields: object|null}} Inspection result.
 */
export function inspectNetpbmHeader(bytes) {
  try {
    if (!bytes || typeof bytes.length !== "number" || bytes.length < 2) {
      return unavailable("Input is too short to contain a Netpbm header.");
    }
    return bytes[0] === 80 && bytes[1] === 55
      ? parsePam(bytes)
      : parseClassic(bytes);
  } catch {
    return unavailable("The Netpbm header could not be parsed.");
  }
}

/**
 * Decodes a Base64 string into bytes.
 * @param {string} value Base64 input.
 * @returns {Uint8Array} Decoded bytes.
 */
export function base64ToBytes(value) {
  const cleaned = value.replace(/\s/g, "");
  if (
    !cleaned ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) ||
    cleaned.length % 4 !== 0
  ) {
    throw new Error("Paste valid Base64-encoded image data.");
  }
  const binary = atob(cleaned);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
