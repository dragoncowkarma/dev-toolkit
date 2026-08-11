import { useMemo, useState } from 'react';
import {
  classifyContrast,
  getContrastRatio,
  parseColor,
  rgbToHex,
} from './colorContrast.utils.js';
import './colorContrast.css';

const DEFAULT_COLORS = { foreground: '#111827', background: '#FFFFFF' };
const SAMPLE_COLORS = { foreground: '#1E3A8A', background: '#DBEAFE' };
const CHECKS = [
  ['aaNormal', 'AA normal', '4.5:1'],
  ['aaLarge', 'AA large', '3:1'],
  ['aaaNormal', 'AAA normal', '7:1'],
  ['aaaLarge', 'AAA large', '4.5:1'],
];

function ColorField({ label, name, value, onChange, parsed }) {
  return (
    <div className="color-contrast__field">
      <label htmlFor={`color-contrast-${name}`}>{label}</label>
      <div className="color-contrast__input-row">
        <input
          id={`color-contrast-${name}`}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#111827, rgb(17, 24, 39), hsl(221, 39%, 11%)"
          spellCheck="false"
        />
        <input
          type="color"
          value={parsed.ok ? rgbToHex(parsed.color) : '#000000'}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          aria-label={`${label} color picker`}
        />
      </div>
    </div>
  );
}

/** Renders an accessible WCAG color-pair contrast analyzer. */
export default function ColorContrastTool() {
  const [foreground, setForeground] = useState(DEFAULT_COLORS.foreground);
  const [background, setBackground] = useState(DEFAULT_COLORS.background);
  const [copyStatus, setCopyStatus] = useState('');

  const foregroundParsed = useMemo(() => parseColor(foreground), [foreground]);
  const backgroundParsed = useMemo(() => parseColor(background), [background]);
  const result = useMemo(
    () => getContrastRatio(foreground, background),
    [foreground, background],
  );
  const classification = result.ok ? classifyContrast(result.ratio) : null;

  function update(setter, value) {
    setter(value);
    setCopyStatus('');
  }

  function loadSample() {
    setForeground(SAMPLE_COLORS.foreground);
    setBackground(SAMPLE_COLORS.background);
    setCopyStatus('');
  }

  function swapColors() {
    setForeground(background);
    setBackground(foreground);
    setCopyStatus('');
  }

  function resetColors() {
    setForeground(DEFAULT_COLORS.foreground);
    setBackground(DEFAULT_COLORS.background);
    setCopyStatus('');
  }

  async function copySummary() {
    if (!result.ok) return;
    const summary = [
      `Foreground ${foreground}; Background ${background}; Contrast ${result.ratio.toFixed(2)}:1.`,
      ...CHECKS.map(([key, label]) => `${label}: ${classification[key] ? 'Pass' : 'Fail'}.`),
    ].join(' ');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(summary);
      setCopyStatus('Contrast summary copied to clipboard.');
    } catch {
      setCopyStatus('Failed to copy contrast summary.');
    }
  }

  const previewStyle = result.ok
    ? { color: foreground, backgroundColor: background }
    : undefined;

  return (
    <section className="color-contrast" aria-labelledby="color-contrast-title">
      <header className="color-contrast__intro">
        <p className="color-contrast__eyebrow">Accessibility</p>
        <h2 id="color-contrast-title">Color Contrast Checker</h2>
        <p>Compare text and background colors against WCAG 2.x AA and AAA thresholds.</p>
      </header>

      <div className="color-contrast__controls" aria-label="Color contrast actions">
        <button type="button" onClick={loadSample}>Load sample</button>
        <button type="button" onClick={swapColors}>Swap foreground and background</button>
        <button type="button" onClick={resetColors}>Reset</button>
      </div>

      <div className="color-contrast__inputs">
        <ColorField
          label="Foreground"
          name="foreground"
          value={foreground}
          onChange={(value) => update(setForeground, value)}
          parsed={foregroundParsed}
        />
        <ColorField
          label="Background"
          name="background"
          value={background}
          onChange={(value) => update(setBackground, value)}
          parsed={backgroundParsed}
        />
      </div>

      {!result.ok && (
        <div className="color-contrast__error" role="alert">
          {result.errors.foreground && <p>Foreground: {result.errors.foreground}</p>}
          {result.errors.background && <p>Background: {result.errors.background}</p>}
        </div>
      )}

      <div className="color-contrast__workspace">
        <div className="color-contrast__preview-card">
          <h3>Live preview</h3>
          <div className="color-contrast__preview" style={previewStyle}>
            <strong>Readable design starts with contrast.</strong>
            <span>Sample normal text (16px)</span>
            <span className="color-contrast__large-text">Sample large text (24px)</span>
          </div>
        </div>

        <div className="color-contrast__results" aria-live="polite">
          <div className="color-contrast__result-heading">
            <div>
              <h3>WCAG results</h3>
              <p className="color-contrast__ratio">
                {result.ok ? `${result.ratio.toFixed(2)}:1` : '—'}
              </p>
            </div>
            <button type="button" onClick={copySummary} disabled={!result.ok}>
              Copy summary
            </button>
          </div>
          {classification && (
            <ul className="color-contrast__checks">
              {CHECKS.map(([key, label, threshold]) => (
                <li key={key}>
                  <span>{label} <small>({threshold})</small></span>
                  <strong className={classification[key] ? 'is-pass' : 'is-fail'}>
                    {classification[key] ? 'Pass' : 'Fail'}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="color-contrast__note">
        Large text means at least 24px regular or about 18.7px bold. Transparent colors are
        composited over a white canvas for analysis.
      </p>
      <p className="color-contrast__copy-status" role="status" aria-live="polite">
        {copyStatus}
      </p>
    </section>
  );
}
