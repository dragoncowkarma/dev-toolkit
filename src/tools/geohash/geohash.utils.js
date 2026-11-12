const BASE32_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';
const MIN_PRECISION = 1;
const MAX_PRECISION = 12;

function validateCoordinate(value, name, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be a number between ${minimum} and ${maximum}.`);
  }
}

function validatePrecision(precision) {
  if (!Number.isInteger(precision) || precision < MIN_PRECISION || precision > MAX_PRECISION) {
    throw new RangeError(
      `Precision must be an integer between ${MIN_PRECISION} and ${MAX_PRECISION}.`
    );
  }
}

/**
 * Encodes latitude and longitude coordinates as a standard Base32 geohash.
 *
 * @param {number} latitude - Latitude from -90 through 90 degrees.
 * @param {number} longitude - Longitude from -180 through 180 degrees.
 * @param {number} [precision=9] - Number of characters in the result, from 1 through 12.
 * @returns {string} The encoded geohash.
 * @throws {RangeError} When coordinates or precision are outside their supported ranges.
 */
export function encodeGeohash(latitude, longitude, precision = 9) {
  validateCoordinate(latitude, 'Latitude', -90, 90);
  validateCoordinate(longitude, 'Longitude', -180, 180);
  validatePrecision(precision);

  let latitudeRange = [-90, 90];
  let longitudeRange = [-180, 180];
  let useLongitude = true;
  let bitCount = 0;
  let characterValue = 0;
  let geohash = '';

  while (geohash.length < precision) {
    const range = useLongitude ? longitudeRange : latitudeRange;
    const coordinate = useLongitude ? longitude : latitude;
    const midpoint = (range[0] + range[1]) / 2;
    characterValue = (characterValue << 1) | Number(coordinate >= midpoint);

    if (coordinate >= midpoint) {
      range[0] = midpoint;
    } else {
      range[1] = midpoint;
    }

    useLongitude = !useLongitude;
    bitCount += 1;

    if (bitCount === 5) {
      geohash += BASE32_ALPHABET[characterValue];
      bitCount = 0;
      characterValue = 0;
    }
  }

  return geohash;
}

/**
 * Decodes a standard Base32 geohash to its bounding-box center and error bounds.
 *
 * @param {string} geohash - A non-empty standard Base32 geohash.
 * @returns {{latitude: number, longitude: number, latitudeError: number, longitudeError: number}}
 * @throws {TypeError|Error} When the input is missing or contains invalid characters.
 */
export function decodeGeohash(geohash) {
  if (typeof geohash !== 'string') {
    throw new TypeError('Geohash must be a string.');
  }

  const normalized = geohash.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new Error('Geohash cannot be empty.');
  }

  let latitudeRange = [-90, 90];
  let longitudeRange = [-180, 180];
  let useLongitude = true;

  for (const character of normalized) {
    const characterValue = BASE32_ALPHABET.indexOf(character);
    if (characterValue === -1) {
      throw new Error(`Invalid geohash character: "${character}".`);
    }

    for (let bit = 4; bit >= 0; bit -= 1) {
      const range = useLongitude ? longitudeRange : latitudeRange;
      const midpoint = (range[0] + range[1]) / 2;
      if ((characterValue & (1 << bit)) !== 0) {
        range[0] = midpoint;
      } else {
        range[1] = midpoint;
      }
      useLongitude = !useLongitude;
    }
  }

  return {
    latitude: (latitudeRange[0] + latitudeRange[1]) / 2,
    longitude: (longitudeRange[0] + longitudeRange[1]) / 2,
    latitudeError: (latitudeRange[1] - latitudeRange[0]) / 2,
    longitudeError: (longitudeRange[1] - longitudeRange[0]) / 2,
  };
}
