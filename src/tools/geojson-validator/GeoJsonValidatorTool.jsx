import { useState } from 'react';
import { parseGeoJson, validateGeoJson } from './geojson.utils.js';
import './geojson.css';

/**
 * Renders a client-side GeoJSON validator and document inspector.
 * @returns {React.JSX.Element} The GeoJSON validator UI.
 */
export default function GeoJsonValidatorTool() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);

  function handleValidate() {
    if (!input.trim()) {
      setResult({ error: 'Paste a GeoJSON document to validate.', validation: null });
      return;
    }
    const parsed = parseGeoJson(input);
    if (parsed.error) {
      setResult({ error: parsed.error, validation: null });
      return;
    }
    setResult({ error: null, validation: validateGeoJson(parsed.value) });
  }

  function handleClear() {
    setInput('');
    setResult(null);
  }

  const validation = result?.validation;

  return (
    <section className="geojson-validator" aria-label="GeoJSON Validator">
      <div className="geojson-validator__toolbar">
        <div>
          <h2>GeoJSON Validator</h2>
          <p>Validate RFC 7946 structures and inspect coordinate coverage locally.</p>
        </div>
        <div className="geojson-validator__actions">
          <button type="button" className="geojson-validator__button primary" onClick={handleValidate}>
            Validate GeoJSON
          </button>
          <button type="button" className="geojson-validator__button" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <label className="geojson-validator__label" htmlFor="geojson-input">GeoJSON document</label>
      <textarea
        id="geojson-input"
        className="geojson-validator__input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={'Paste GeoJSON, for example:\n{"type":"Point","coordinates":[127,37.5]}'}
        spellCheck={false}
      />

      {result?.error && <div className="geojson-validator__error" role="alert">{result.error}</div>}

      {validation && (
        <div className="geojson-validator__results">
          <div className={validation.errors.length ? 'geojson-validator__error' : 'geojson-validator__valid'}
            role="status">
            {validation.errors.length
              ? `${validation.errors.length} validation error${validation.errors.length === 1 ? '' : 's'} found.`
              : 'Valid GeoJSON.'}
          </div>

          <div className="geojson-validator__summary">
            <h3>Summary</h3>
            <p><strong>Coordinates:</strong> {validation.summary.coordinateCount}</p>
            <p><strong>Bounding box:</strong> {validation.summary.boundingBox
              ? `[${validation.summary.boundingBox.join(', ')}]`
              : 'No valid positions found'}</p>
            <h4>Geometry types</h4>
            {Object.keys(validation.summary.geometryCounts).length ? (
              <ul>{Object.entries(validation.summary.geometryCounts).map(([type, count]) => (
                <li key={type}>{type}: {count}</li>
              ))}</ul>
            ) : <p>No geometries found.</p>}
          </div>

          {validation.errors.length > 0 && <div className="geojson-validator__errors">
            <h3>Validation errors</h3>
            <ul>{validation.errors.map((error, index) => (
              <li key={`${error.path}-${index}`}><code>{error.path}</code>: {error.message}</li>
            ))}</ul>
          </div>}
        </div>
      )}
    </section>
  );
}
