import { useEffect, useMemo, useState } from 'react';
import {
  addStop,
  generateCssGradient,
  normalizeHexForPicker,
  removeStop,
  reorderStops,
  sortStopsByPosition,
} from './cssGradient.utils.js';
import './cssGradient.css';

const DEFAULT_STOPS = [
  { id: 'stop-1', color: '#6366f1', position: 0 },
  { id: 'stop-2', color: '#a78bfa', position: 50 },
  { id: 'stop-3', color: '#34d399', position: 100 },
];

const PRESETS = [
  {
    name: 'Indigo Pulse',
    type: 'linear',
    angle: 135,
    stops: [
      { id: 'p1-1', color: '#6366f1', position: 0 },
      { id: 'p1-2', color: '#a78bfa', position: 50 },
      { id: 'p1-3', color: '#ec4899', position: 100 },
    ],
  },
  {
    name: 'Ocean Glow',
    type: 'radial',
    shape: 'circle',
    radialPosition: 'center',
    stops: [
      { id: 'p2-1', color: '#38bdf8', position: 0 },
      { id: 'p2-2', color: '#3b82f6', position: 60 },
      { id: 'p2-3', color: '#0f172a', position: 100 },
    ],
  },
  {
    name: 'Neon Conic',
    type: 'conic',
    conicAngle: 0,
    conicPosition: 'center',
    stops: [
      { id: 'p3-1', color: '#f43f5e', position: 0 },
      { id: 'p3-2', color: '#eab308', position: 33 },
      { id: 'p3-3', color: '#06b6d4', position: 66 },
      { id: 'p3-4', color: '#f43f5e', position: 100 },
    ],
  },
];

/**
 * Renders the CSS Gradient Generator tool allowing developers to visually construct
 * linear, radial, and conic gradients with multi-stop color management and instant CSS export.
 *
 * @returns {React.JSX.Element} The CSS Gradient Generator component.
 */
export default function CssGradientTool() {
  const [type, setType] = useState('linear');
  const [angle, setAngle] = useState(90);
  const [direction, setDirection] = useState('to right');
  const [useKeywordDirection, setUseKeywordDirection] = useState(false);
  const [shape, setShape] = useState('circle');
  const [radialPosition, setRadialPosition] = useState('center');
  const [conicAngle, setConicAngle] = useState(0);
  const [conicPosition, setConicPosition] = useState('center');
  const [stops, setStops] = useState(DEFAULT_STOPS);
  const [notice, setNotice] = useState('');

  const gradientResult = useMemo(() => {
    return generateCssGradient({
      type,
      angle: Number(angle),
      direction,
      useKeywordDirection,
      shape,
      radialPosition,
      conicAngle: Number(conicAngle),
      conicPosition,
      stops,
    });
  }, [
    type,
    angle,
    direction,
    useKeywordDirection,
    shape,
    radialPosition,
    conicAngle,
    conicPosition,
    stops,
  ]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function handleCopy() {
    if (!gradientResult.valid || !gradientResult.declaration) return;
    try {
      await navigator.clipboard.writeText(gradientResult.declaration);
      setNotice('Copied CSS declaration to clipboard!');
    } catch {
      setNotice('Failed to copy CSS to clipboard.');
    }
  }

  function handleAddStop() {
    setStops((prevStops) => addStop(prevStops));
  }

  function handleRemoveStop(stopId) {
    if (stops.length <= 2) {
      setNotice('Gradient requires at least 2 color stops.');
      return;
    }
    setStops((prevStops) => removeStop(prevStops, stopId));
  }

  function handleMoveStop(index, delta) {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= stops.length) return;
    setStops((prevStops) => reorderStops(prevStops, index, targetIndex));
  }

  function handleUpdateStop(index, field, value) {
    setStops((prevStops) => {
      const nextStops = [...prevStops];
      nextStops[index] = {
        ...nextStops[index],
        [field]: value,
      };
      return nextStops;
    });
  }

  function handleSortStops() {
    setStops((prevStops) => sortStopsByPosition(prevStops));
    setNotice('Sorted stops by position.');
  }

  function handleApplyPreset(preset) {
    setType(preset.type);
    if (preset.angle !== undefined) setAngle(preset.angle);
    if (preset.shape) setShape(preset.shape);
    if (preset.radialPosition) setRadialPosition(preset.radialPosition);
    if (preset.conicAngle !== undefined) setConicAngle(preset.conicAngle);
    if (preset.conicPosition) setConicPosition(preset.conicPosition);
    if (preset.stops) setStops(preset.stops);
    setNotice(`Applied "${preset.name}" preset.`);
  }

  return (
    <section className="css-gradient-tool" aria-label="CSS Gradient Generator Tool">
      <div className="css-gradient-tool__preset-bar">
        <span className="css-gradient-tool__preset-label">Presets:</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            className="css-gradient-tool__preset-btn"
            onClick={() => handleApplyPreset(preset)}
          >
            {preset.name}
          </button>
        ))}
      </div>

      <div className="css-gradient-tool__grid">
        <div className="css-gradient-tool__controls">
          <div className="css-gradient-tool__section">
            <h3 className="css-gradient-tool__section-title">Gradient Type</h3>
            <div
              className="css-gradient-tool__type-selector"
              role="group"
              aria-label="Gradient Type"
            >
              <button
                type="button"
                className={`css-gradient-tool__type-btn ${
                  type === 'linear' ? 'css-gradient-tool__type-btn--active' : ''
                }`}
                onClick={() => setType('linear')}
              >
                Linear
              </button>
              <button
                type="button"
                className={`css-gradient-tool__type-btn ${
                  type === 'radial' ? 'css-gradient-tool__type-btn--active' : ''
                }`}
                onClick={() => setType('radial')}
              >
                Radial
              </button>
              <button
                type="button"
                className={`css-gradient-tool__type-btn ${
                  type === 'conic' ? 'css-gradient-tool__type-btn--active' : ''
                }`}
                onClick={() => setType('conic')}
              >
                Conic
              </button>
            </div>
          </div>

          {type === 'linear' && (
            <div className="css-gradient-tool__section">
              <div className="css-gradient-tool__section-header">
                <h3 className="css-gradient-tool__section-title">Linear Options</h3>
                <label className="css-gradient-tool__checkbox-label">
                  <input
                    type="checkbox"
                    checked={useKeywordDirection}
                    onChange={(e) => setUseKeywordDirection(e.target.checked)}
                  />
                  Use Direction Keyword
                </label>
              </div>

              {useKeywordDirection ? (
                <div className="css-gradient-tool__field">
                  <label htmlFor="gradient-direction">Direction Keyword</label>
                  <select
                    id="gradient-direction"
                    value={direction}
                    onChange={(e) => setDirection(e.target.value)}
                  >
                    <option value="to right">to right</option>
                    <option value="to left">to left</option>
                    <option value="to top">to top</option>
                    <option value="to bottom">to bottom</option>
                    <option value="to top right">to top right</option>
                    <option value="to top left">to top left</option>
                    <option value="to bottom right">to bottom right</option>
                    <option value="to bottom left">to bottom left</option>
                  </select>
                </div>
              ) : (
                <div className="css-gradient-tool__field">
                  <div className="css-gradient-tool__field-header">
                    <label htmlFor="gradient-angle">Angle ({angle}°)</label>
                    <input
                      type="number"
                      id="gradient-angle-num"
                      aria-label="Linear angle degrees number input"
                      min="0"
                      max="360"
                      value={angle}
                      onChange={(e) => setAngle(e.target.value)}
                    />
                  </div>
                  <input
                    type="range"
                    id="gradient-angle"
                    aria-label="Linear angle slider"
                    min="0"
                    max="360"
                    value={angle}
                    onChange={(e) => setAngle(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {type === 'radial' && (
            <div className="css-gradient-tool__section">
              <h3 className="css-gradient-tool__section-title">Radial Options</h3>
              <div className="css-gradient-tool__field">
                <label htmlFor="gradient-radial-shape">Shape</label>
                <select
                  id="gradient-radial-shape"
                  value={shape}
                  onChange={(e) => setShape(e.target.value)}
                >
                  <option value="circle">circle</option>
                  <option value="ellipse">ellipse</option>
                </select>
              </div>
              <div className="css-gradient-tool__field">
                <label htmlFor="gradient-radial-pos">Position</label>
                <select
                  id="gradient-radial-pos"
                  value={radialPosition}
                  onChange={(e) => setRadialPosition(e.target.value)}
                >
                  <option value="center">center</option>
                  <option value="top">top</option>
                  <option value="bottom">bottom</option>
                  <option value="left">left</option>
                  <option value="right">right</option>
                  <option value="top left">top left</option>
                  <option value="top right">top right</option>
                  <option value="bottom left">bottom left</option>
                  <option value="bottom right">bottom right</option>
                </select>
              </div>
            </div>
          )}

          {type === 'conic' && (
            <div className="css-gradient-tool__section">
              <h3 className="css-gradient-tool__section-title">Conic Options</h3>
              <div className="css-gradient-tool__field">
                <div className="css-gradient-tool__field-header">
                  <label htmlFor="gradient-conic-angle">Starting Angle ({conicAngle}°)</label>
                  <input
                    type="number"
                    id="gradient-conic-angle-num"
                    aria-label="Conic starting angle number input"
                    min="0"
                    max="360"
                    value={conicAngle}
                    onChange={(e) => setConicAngle(e.target.value)}
                  />
                </div>
                <input
                  type="range"
                  id="gradient-conic-angle"
                  aria-label="Conic starting angle slider"
                  min="0"
                  max="360"
                  value={conicAngle}
                  onChange={(e) => setConicAngle(e.target.value)}
                />
              </div>
              <div className="css-gradient-tool__field">
                <label htmlFor="gradient-conic-pos">Center Position</label>
                <select
                  id="gradient-conic-pos"
                  value={conicPosition}
                  onChange={(e) => setConicPosition(e.target.value)}
                >
                  <option value="center">center</option>
                  <option value="top left">top left</option>
                  <option value="top right">top right</option>
                  <option value="bottom left">bottom left</option>
                  <option value="bottom right">bottom right</option>
                </select>
              </div>
            </div>
          )}

          <div className="css-gradient-tool__section">
            <div className="css-gradient-tool__section-header">
              <h3 className="css-gradient-tool__section-title">Color Stops ({stops.length})</h3>
              <div className="css-gradient-tool__stop-actions">
                <button
                  type="button"
                  className="css-gradient-tool__btn css-gradient-tool__btn--secondary"
                  onClick={handleSortStops}
                >
                  Sort Stops
                </button>
                <button
                  type="button"
                  className="css-gradient-tool__btn css-gradient-tool__btn--primary"
                  onClick={handleAddStop}
                >
                  + Add Stop
                </button>
              </div>
            </div>

            <div className="css-gradient-tool__stop-list">
              {stops.map((stop, index) => (
                <div key={stop.id} className="css-gradient-tool__stop-item">
                  <div className="css-gradient-tool__stop-order-btns">
                    <button
                      type="button"
                      className="css-gradient-tool__icon-btn"
                      title="Move Up"
                      aria-label={`Move stop ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => handleMoveStop(index, -1)}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="css-gradient-tool__icon-btn"
                      title="Move Down"
                      aria-label={`Move stop ${index + 1} down`}
                      disabled={index === stops.length - 1}
                      onClick={() => handleMoveStop(index, 1)}
                    >
                      ▼
                    </button>
                  </div>

                  <div className="css-gradient-tool__color-controls">
                    <input
                      type="color"
                      className="css-gradient-tool__color-picker"
                      aria-label={`Color picker for stop ${index + 1}`}
                      value={normalizeHexForPicker(stop.color)}
                      onChange={(e) => handleUpdateStop(index, 'color', e.target.value)}
                    />
                    <input
                      type="text"
                      className="css-gradient-tool__color-text"
                      aria-label={`Color text input for stop ${index + 1}`}
                      placeholder="#rrggbb or rgba()"
                      value={stop.color}
                      onChange={(e) => handleUpdateStop(index, 'color', e.target.value)}
                    />
                  </div>

                  <div className="css-gradient-tool__pos-controls">
                    <input
                      type="number"
                      className="css-gradient-tool__pos-number"
                      aria-label={`Position percentage for stop ${index + 1}`}
                      min="0"
                      max="100"
                      value={stop.position}
                      onChange={(e) => handleUpdateStop(index, 'position', e.target.value)}
                    />
                    <span className="css-gradient-tool__pos-unit">%</span>
                    <input
                      type="range"
                      className="css-gradient-tool__pos-slider"
                      aria-label={`Position slider for stop ${index + 1}`}
                      min="0"
                      max="100"
                      value={stop.position !== '' ? stop.position : 0}
                      onChange={(e) => handleUpdateStop(index, 'position', e.target.value)}
                    />
                  </div>

                  <button
                    type="button"
                    className="css-gradient-tool__icon-btn css-gradient-tool__icon-btn--danger"
                    title="Remove Stop"
                    aria-label={`Remove color stop ${index + 1}`}
                    disabled={stops.length <= 2}
                    onClick={() => handleRemoveStop(stop.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="css-gradient-tool__preview-panel">
          <div className="css-gradient-tool__section">
            <h3 className="css-gradient-tool__section-title">Live Preview</h3>
            {!gradientResult.valid ? (
              <div className="css-gradient-tool__alert" role="alert">
                {gradientResult.error}
              </div>
            ) : (
              <div
                className="css-gradient-tool__preview-box"
                style={{ background: gradientResult.css }}
                aria-label="Live gradient preview"
              />
            )}
          </div>

          <div className="css-gradient-tool__section">
            <div className="css-gradient-tool__section-header">
              <h3 className="css-gradient-tool__section-title">Generated CSS</h3>
              <button
                type="button"
                className="css-gradient-tool__btn css-gradient-tool__btn--primary"
                onClick={handleCopy}
                disabled={!gradientResult.valid}
              >
                Copy CSS
              </button>
            </div>

            <div className="css-gradient-tool__code-panel">
              <code>
                {gradientResult.valid
                  ? gradientResult.declaration
                  : '/* Fix validation errors above */'}
              </code>
            </div>
          </div>

          <div className="css-gradient-tool__notice" role="status" aria-live="polite">
            {notice}
          </div>
        </div>
      </div>
    </section>
  );
}
