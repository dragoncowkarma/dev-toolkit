import { useEffect, useState } from 'react';
import { decodeGeohash, encodeGeohash } from './geohash.utils.js';
import './geohash.css';

function formatCoordinate(value) {
  return value.toFixed(6);
}

/**
 * Renders independent coordinate encoding and geohash decoding forms.
 *
 * @returns {React.JSX.Element} The Geohash converter UI.
 */
export default function GeohashTool() {
  const [latitude, setLatitude] = useState('37.5665');
  const [longitude, setLongitude] = useState('126.9780');
  const [precision, setPrecision] = useState(9);
  const [encodedGeohash, setEncodedGeohash] = useState('');
  const [encodeError, setEncodeError] = useState('');
  const [geohash, setGeohash] = useState('');
  const [decodedLocation, setDecodedLocation] = useState(null);
  const [decodeError, setDecodeError] = useState('');

  useEffect(() => {
    try {
      setEncodedGeohash(encodeGeohash(Number(latitude), Number(longitude), precision));
      setEncodeError('');
    } catch (error) {
      setEncodedGeohash('');
      setEncodeError(error.message);
    }
  }, [latitude, longitude, precision]);

  useEffect(() => {
    if (geohash.trim() === '') {
      setDecodedLocation(null);
      setDecodeError('');
      return;
    }

    try {
      setDecodedLocation(decodeGeohash(geohash));
      setDecodeError('');
    } catch (error) {
      setDecodedLocation(null);
      setDecodeError(error.message);
    }
  }, [geohash]);

  return (
    <section className="geohash-tool" aria-label="Geohash Encoder and Decoder Tool">
      <div className="geohash-panel">
        <h2>Encode coordinates</h2>
        <div className="geohash-fields">
          <label htmlFor="geohash-latitude">
            Latitude
            <input
              id="geohash-latitude"
              type="number"
              min="-90"
              max="90"
              step="any"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
            />
          </label>
          <label htmlFor="geohash-longitude">
            Longitude
            <input
              id="geohash-longitude"
              type="number"
              min="-180"
              max="180"
              step="any"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
            />
          </label>
          <label htmlFor="geohash-precision">
            Precision: {precision}
            <input
              id="geohash-precision"
              type="range"
              min="1"
              max="12"
              value={precision}
              onChange={(event) => setPrecision(Number(event.target.value))}
            />
          </label>
        </div>
        {encodeError ? (
          <p className="geohash-error" role="alert">{encodeError}</p>
        ) : (
          <output className="geohash-result" aria-label="Encoded geohash">{encodedGeohash}</output>
        )}
      </div>

      <div className="geohash-panel">
        <h2>Decode geohash</h2>
        <label htmlFor="geohash-input">
          Geohash
          <input
            id="geohash-input"
            type="text"
            value={geohash}
            onChange={(event) => setGeohash(event.target.value)}
            placeholder="e.g. wydm8"
            spellCheck={false}
          />
        </label>
        {decodeError && <p className="geohash-error" role="alert">{decodeError}</p>}
        {decodedLocation && (
          <dl className="geohash-decoded" aria-label="Decoded coordinates">
            <div><dt>Latitude</dt><dd>{formatCoordinate(decodedLocation.latitude)}</dd></div>
            <div><dt>Longitude</dt><dd>{formatCoordinate(decodedLocation.longitude)}</dd></div>
            <div>
              <dt>Latitude error</dt>
              <dd>±{formatCoordinate(decodedLocation.latitudeError)}</dd>
            </div>
            <div>
              <dt>Longitude error</dt>
              <dd>±{formatCoordinate(decodedLocation.longitudeError)}</dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}
