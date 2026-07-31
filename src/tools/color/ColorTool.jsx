import React, { useState, useEffect, useMemo } from 'react';
import {
  parseColor,
  rgbToHex,
  getContrastingTextColor,
} from './color.utils.js';
import './color.css';

const TOAST_DURATION_MS = 2500;

const PRESET_COLORS = [
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Emerald', hex: '#34D399' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Amber', hex: '#FBBF24' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Purple', hex: '#A78BFA' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Teal', hex: '#10B981' },
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#FFFFFF' },
];

/**
 * Main Color Converter Tool Component.
 *
 * @param {object} props
 * @param {Function} [props.onBack] Callback when back button is clicked.
 * @returns {React.JSX.Element} The Color Tool UI.
 */
export default function ColorTool({ onBack }) {
  const [input, setInput] = useState('#6366F1');
  const [toast, setToast] = useState('');

  const parsed = useMemo(() => parseColor(input), [input]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast('');
    }, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  const handleColorPickerChange = (e) => {
    setInput(e.target.value.toUpperCase());
  };

  const handleClear = () => {
    setInput('');
  };

  const handlePresetSelect = (hex) => {
    setInput(hex);
  };

  const handleRgbSliderChange = (channel, val) => {
    if (!parsed.isValid || !parsed.rgb) return;
    if (val === '') return;
    const parsedInt = parseInt(val, 10);
    if (isNaN(parsedInt)) return;
    const num = Math.min(255, Math.max(0, parsedInt));
    const nextRgb = { ...parsed.rgb, [channel]: num };
    const nextHex = rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b);
    setInput(nextHex);
  };

  const handleCopy = async (text, label) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setToast(`${label} copied to clipboard!`);
    } catch {
      setToast(`Failed to copy ${label}`);
    }
  };

  const textColor = parsed.isValid && parsed.rgb
    ? getContrastingTextColor(parsed.rgb.r, parsed.rgb.g, parsed.rgb.b)
    : '#FFFFFF';

  return (
    <section className="color-tool" aria-label="Color Converter Tool">
      {toast && (
        <div className="color-toast" role="status">
          <span>✅</span> {toast}
        </div>
      )}

      <div className="color-header-row">
        <div className="color-title-group">
          {onBack && (
            <button
              className="color-tool__back-button"
              onClick={onBack}
              aria-label="Go back to tool dashboard"
              type="button"
            >
              <span>←</span> Back
            </button>
          )}
          <h2 className="color-title">Color Converter</h2>
        </div>
      </div>

      {/* Main Input Section */}
      <div className="color-input-card">
        <label htmlFor="color-main-input" className="color-tool__card-title">
          Color Code (HEX, RGB, HSL)
        </label>
        <div className="color-input-row">
          <div
            className="color-picker-wrapper"
            title="Click to pick a color"
            style={{
              backgroundColor: parsed.isValid ? parsed.hex : '#000000',
            }}
          >
            <input
              type="color"
              className="color-picker-input"
              value={parsed.isValid ? parsed.hex : '#000000'}
              onChange={handleColorPickerChange}
              aria-label="Color picker"
            />
          </div>

          <div className="color-text-input-wrapper">
            <input
              id="color-main-input"
              type="text"
              className="color-text-input"
              placeholder="e.g. #6366F1, rgb(99, 102, 241), or hsl(239, 84%, 67%)"
              value={input}
              onChange={handleInputChange}
              aria-label="Color code input"
              spellCheck={false}
            />
            {parsed.isValid && (
              <span className="color-format-badge">{parsed.format}</span>
            )}
          </div>

          <button
            type="button"
            className="color-tool__btn"
            onClick={handleClear}
            aria-label="Clear input"
          >
            Clear
          </button>
        </div>

        {!parsed.isValid && input.trim() !== '' && (
          <div className="color-error" role="alert">
            <span>⚠</span> {parsed.error}
          </div>
        )}
      </div>

      {/* Workspace Grid */}
      <div className="color-grid">
        {/* Color Swatch Preview Card */}
        <div className="color-card">
          <h3 className="color-tool__card-title">Real-time Preview</h3>
          <div
            className="color-tool__swatch-display"
            style={{
              backgroundColor: parsed.isValid ? parsed.hex : 'transparent',
              color: textColor,
              border: parsed.isValid ? 'none' : '1px dashed var(--color-border)',
            }}
            aria-label="Color swatch preview"
          >
            {parsed.isValid ? (
              <>
                <span className="color-tool__swatch-text-lg">{parsed.hex}</span>
                <span className="color-tool__swatch-text-sm">{parsed.rgbStr}</span>
                <span className="color-tool__swatch-text-sm">{parsed.hslStr}</span>
              </>
            ) : (
              <span
                className="color-tool__swatch-text-sm"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Enter a valid color code to preview
              </span>
            )}
          </div>

          {/* RGB Sliders for interactive tweaking */}
          {parsed.isValid && parsed.rgb && (
            <div className="color-tool__sliders-group">
              <span className="color-tool__card-title" style={{ fontSize: '0.875rem' }}>
                RGB Adjuster
              </span>
              <div className="color-tool__slider-row">
                <span className="color-tool__slider-label red">R</span>
                <input
                  type="range"
                  min="0"
                  max="255"
                  className="color-range-input"
                  value={parsed.rgb.r}
                  onChange={(e) => handleRgbSliderChange('r', e.target.value)}
                  aria-label="Red channel"
                />
                <input
                  type="number"
                  min="0"
                  max="255"
                  className="color-tool__slider-val-input"
                  value={parsed.rgb.r}
                  onChange={(e) => handleRgbSliderChange('r', e.target.value)}
                  aria-label="Red value"
                />
              </div>

              <div className="color-tool__slider-row">
                <span className="color-tool__slider-label green">G</span>
                <input
                  type="range"
                  min="0"
                  max="255"
                  className="color-range-input"
                  value={parsed.rgb.g}
                  onChange={(e) => handleRgbSliderChange('g', e.target.value)}
                  aria-label="Green channel"
                />
                <input
                  type="number"
                  min="0"
                  max="255"
                  className="color-tool__slider-val-input"
                  value={parsed.rgb.g}
                  onChange={(e) => handleRgbSliderChange('g', e.target.value)}
                  aria-label="Green value"
                />
              </div>

              <div className="color-tool__slider-row">
                <span className="color-tool__slider-label blue">B</span>
                <input
                  type="range"
                  min="0"
                  max="255"
                  className="color-range-input"
                  value={parsed.rgb.b}
                  onChange={(e) => handleRgbSliderChange('b', e.target.value)}
                  aria-label="Blue channel"
                />
                <input
                  type="number"
                  min="0"
                  max="255"
                  className="color-tool__slider-val-input"
                  value={parsed.rgb.b}
                  onChange={(e) => handleRgbSliderChange('b', e.target.value)}
                  aria-label="Blue value"
                />
              </div>
            </div>
          )}
        </div>

        {/* Converted Formats & Presets Card */}
        <div className="color-card">
          <h3 className="color-tool__card-title">Converted Formats</h3>
          <div className="color-tool__format-list">
            <div className="color-tool__format-item">
              <div className="color-tool__format-info">
                <span className="color-tool__format-label">HEX</span>
                <span className="color-tool__format-value">
                  {parsed.isValid ? parsed.hex : '—'}
                </span>
              </div>
              <button
                type="button"
                className="color-tool__btn"
                onClick={() => handleCopy(parsed.hex, 'HEX')}
                disabled={!parsed.isValid}
                aria-label="Copy HEX value"
              >
                📋 Copy
              </button>
            </div>

            <div className="color-tool__format-item">
              <div className="color-tool__format-info">
                <span className="color-tool__format-label">RGB</span>
                <span className="color-tool__format-value">
                  {parsed.isValid ? parsed.rgbStr : '—'}
                </span>
              </div>
              <button
                type="button"
                className="color-tool__btn"
                onClick={() => handleCopy(parsed.rgbStr, 'RGB')}
                disabled={!parsed.isValid}
                aria-label="Copy RGB value"
              >
                📋 Copy
              </button>
            </div>

            <div className="color-tool__format-item">
              <div className="color-tool__format-info">
                <span className="color-tool__format-label">HSL</span>
                <span className="color-tool__format-value">
                  {parsed.isValid ? parsed.hslStr : '—'}
                </span>
              </div>
              <button
                type="button"
                className="color-tool__btn"
                onClick={() => handleCopy(parsed.hslStr, 'HSL')}
                disabled={!parsed.isValid}
                aria-label="Copy HSL value"
              >
                📋 Copy
              </button>
            </div>
          </div>

          <div style={{ marginTop: '0.75rem' }}>
            <h4 className="color-tool__card-title" style={{ fontSize: '0.875rem' }}>
              Preset Swatches
            </h4>
            <div className="color-tool__presets-grid" aria-label="Preset color palette">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  className="color-tool__preset-chip"
                  style={{ backgroundColor: preset.hex }}
                  onClick={() => handlePresetSelect(preset.hex)}
                  title={`${preset.name} (${preset.hex})`}
                  aria-label={`Select preset ${preset.name} ${preset.hex}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
