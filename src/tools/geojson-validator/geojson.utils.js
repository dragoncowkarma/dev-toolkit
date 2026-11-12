const GEOMETRY_TYPES = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection',
]);

const GEOJSON_TYPES = new Set([...GEOMETRY_TYPES, 'Feature', 'FeatureCollection']);

/**
 * Parses JSON text and returns a helpful line and column when parsing fails.
 * @param {string} text
 * @returns {{ value: unknown, error: null } | { value: null, error: string }}
 */
export function parseGeoJson(text) {
  try {
    return { value: JSON.parse(text), error: null };
  } catch (error) {
    const position = /position (\d+)/i.exec(error.message)?.[1] ??
      findUnexpectedTokenPosition(text, error.message);
    if (position === undefined) return { value: null, error: `Invalid JSON: ${error.message}` };

    const beforeError = text.slice(0, Number(position));
    const line = beforeError.split('\n').length;
    const column = beforeError.length - beforeError.lastIndexOf('\n');
    return { value: null, error: `Invalid JSON at line ${line}, column ${column}.` };
  }
}

function findUnexpectedTokenPosition(text, message) {
  const token = /Unexpected token ['"](.+?)['"]/i.exec(message)?.[1];
  if (!token) return undefined;
  const position = text.lastIndexOf(token);
  return position === -1 ? undefined : String(position);
}

/**
 * Validates a GeoJSON document and produces an inspection summary.
 * @param {unknown} document
 * @returns {{ errors: Array<{path: string, message: string}>, summary: GeoJsonSummary }}
 */
export function validateGeoJson(document) {
  const errors = [];
  const positions = [];
  const geometryCounts = {};

  validateNode(document, '', errors, positions, geometryCounts);

  return {
    errors,
    summary: {
      geometryCounts,
      coordinateCount: positions.length,
      boundingBox: createBoundingBox(positions),
    },
  };
}

/**
 * @typedef {object} GeoJsonSummary
 * @property {Record<string, number>} geometryCounts
 * @property {number} coordinateCount
 * @property {number[] | null} boundingBox
 */

function validateNode(node, path, errors, positions, geometryCounts) {
  if (!isPlainObject(node)) {
    addError(errors, path, 'Expected an object.');
    return;
  }

  if (!Object.hasOwn(node, 'type')) {
    addError(errors, path, 'Missing required "type" member.');
    return;
  }
  if (!GEOJSON_TYPES.has(node.type)) {
    addError(errors, joinPath(path, 'type'), `Invalid GeoJSON type "${node.type}".`);
    return;
  }

  if (node.type === 'Feature') {
    validateFeature(node, path, errors, positions, geometryCounts);
  } else if (node.type === 'FeatureCollection') {
    validateFeatureCollection(node, path, errors, positions, geometryCounts);
  } else {
    geometryCounts[node.type] = (geometryCounts[node.type] ?? 0) + 1;
    validateGeometry(node, path, errors, positions, geometryCounts);
  }
}

function validateFeature(feature, path, errors, positions, geometryCounts) {
  if (!Object.hasOwn(feature, 'properties') ||
    (feature.properties !== null && !isPlainObject(feature.properties))) {
    addError(errors, joinPath(path, 'properties'), 'Expected an object or null.');
  }
  if (!Object.hasOwn(feature, 'geometry') ||
    (feature.geometry !== null && !isPlainObject(feature.geometry))) {
    addError(errors, joinPath(path, 'geometry'), 'Expected a GeoJSON object or null.');
  } else if (feature.geometry !== null) {
    const geometryPath = joinPath(path, 'geometry');
    if (!GEOMETRY_TYPES.has(feature.geometry.type)) {
      addError(errors, geometryPath, 'Expected a geometry object.');
      return;
    }
    geometryCounts[feature.geometry.type] = (geometryCounts[feature.geometry.type] ?? 0) + 1;
    validateGeometry(feature.geometry, geometryPath, errors, positions, geometryCounts);
  }
}

function validateFeatureCollection(collection, path, errors, positions, geometryCounts) {
  if (!Array.isArray(collection.features)) {
    addError(errors, joinPath(path, 'features'), 'Expected an array of Feature objects.');
    return;
  }
  collection.features.forEach((feature, index) => {
    const featurePath = `${joinPath(path, 'features')}[${index}]`;
    if (!isPlainObject(feature) || feature.type !== 'Feature') {
      addError(errors, featurePath, 'Expected a Feature object.');
      return;
    }
    validateFeature(feature, featurePath, errors, positions, geometryCounts);
  });
}

function validateGeometry(geometry, path, errors, positions, geometryCounts) {
  if (geometry.type === 'GeometryCollection') {
    if (!Array.isArray(geometry.geometries)) {
      addError(errors, joinPath(path, 'geometries'), 'Expected an array of geometry objects.');
      return;
    }
    geometry.geometries.forEach((item, index) => {
      const geometryPath = `${joinPath(path, 'geometries')}[${index}]`;
      if (!isPlainObject(item) || !GEOMETRY_TYPES.has(item.type)) {
        addError(errors, geometryPath, 'Expected a geometry object.');
        return;
      }
      geometryCounts[item.type] = (geometryCounts[item.type] ?? 0) + 1;
      validateGeometry(item, geometryPath, errors, positions, geometryCounts);
    });
    return;
  }

  if (!Object.hasOwn(geometry, 'coordinates')) {
    addError(errors, joinPath(path, 'coordinates'), 'Missing required coordinates member.');
    return;
  }
  validateCoordinates(
    geometry.coordinates,
    geometry.type,
    joinPath(path, 'coordinates'),
    errors,
    positions,
  );
}

function validateCoordinates(coordinates, type, path, errors, positions) {
  const depth = coordinateDepth(type);
  validateCoordinateLevel(coordinates, depth, path, errors, positions);
  validateMinimumPositions(coordinates, type, path, errors);
  if (type === 'Polygon') validateRings(coordinates, path, errors);
  if (type === 'MultiPolygon' && Array.isArray(coordinates)) {
    coordinates.forEach((polygon, index) => validateRings(polygon, `${path}[${index}]`, errors));
  }
}

function validateMinimumPositions(coordinates, type, path, errors) {
  if (type === 'LineString' && Array.isArray(coordinates) && coordinates.length < 2) {
    addError(errors, path, 'LineString must contain at least 2 positions.');
  }
  if (type === 'MultiLineString' && Array.isArray(coordinates)) {
    coordinates.forEach((line, index) => {
      if (Array.isArray(line) && line.length < 2) {
        addError(errors, `${path}[${index}]`, 'LineString must contain at least 2 positions.');
      }
    });
  }
}

function validateCoordinateLevel(value, remainingDepth, path, errors, positions) {
  if (remainingDepth === 0) {
    validatePosition(value, path, errors, positions);
    return;
  }
  if (!Array.isArray(value)) {
    addError(errors, path, 'Expected an array of coordinates.');
    return;
  }
  value.forEach((child, index) => {
    validateCoordinateLevel(child, remainingDepth - 1, `${path}[${index}]`, errors, positions);
  });
}

function validatePosition(position, path, errors, positions) {
  if (!Array.isArray(position) || position.length < 2 || position.length > 3) {
    addError(errors, path, 'Expected a position of [longitude, latitude] with optional altitude.');
    return;
  }
  const [longitude, latitude, altitude] = position;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    addError(errors, `${path}[0]`, 'Longitude must be a number between -180 and 180.');
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    addError(errors, `${path}[1]`, 'Latitude must be a number between -90 and 90.');
  }
  if (position.length === 3 && !Number.isFinite(altitude)) {
    addError(errors, `${path}[2]`, 'Altitude must be a finite number.');
  }
  if (Number.isFinite(longitude) && Number.isFinite(latitude) && longitude >= -180 &&
    longitude <= 180 && latitude >= -90 && latitude <= 90) {
    positions.push([longitude, latitude]);
  }
}

function validateRings(rings, path, errors) {
  if (!Array.isArray(rings)) return;
  rings.forEach((ring, index) => {
    const ringPath = `${path}[${index}]`;
    if (!Array.isArray(ring) || ring.length < 4) {
      addError(errors, ringPath, 'A polygon ring must have at least 4 positions.');
      return;
    }
    if (!positionsEqual(ring[0], ring[ring.length - 1])) {
      addError(errors, ringPath, 'A polygon ring must be closed (first and last positions equal).');
    }
  });
}

function coordinateDepth(type) {
  return {
    Point: 0,
    MultiPoint: 1,
    LineString: 1,
    MultiLineString: 2,
    Polygon: 2,
    MultiPolygon: 3,
  }[type];
}

function createBoundingBox(positions) {
  if (positions.length === 0) return null;
  const longitudes = positions.map(([longitude]) => longitude);
  const latitudes = positions.map(([, latitude]) => latitude);
  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ];
}

function positionsEqual(first, last) {
  return Array.isArray(first) && Array.isArray(last) && first.length === last.length &&
    first.every((value, index) => value === last[index]);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function joinPath(path, member) {
  return path ? `${path}.${member}` : member;
}

function addError(errors, path, message) {
  errors.push({ path: path || 'document', message });
}
