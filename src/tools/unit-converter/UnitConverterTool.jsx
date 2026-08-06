import { useMemo, useState } from 'react';
import {
  convertUnit,
  formatConversionResult,
  parseConversionValue,
  UNIT_CATEGORIES,
} from './unitConverter.utils.js';
import './unitConverter.css';

const DEFAULT_CATEGORY = 'length';
const DEFAULT_UNITS = {
  length: ['m', 'km'],
  weight: ['g', 'kg'],
  temperature: ['celsius', 'fahrenheit'],
  volume: ['ml', 'l'],
};

/**
 * Renders an accessible physical-unit converter with live conversion results.
 *
 * @returns {React.JSX.Element} The Unit Converter tool UI.
 */
export default function UnitConverterTool() {
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [fromUnit, setFromUnit] = useState(DEFAULT_UNITS.length[0]);
  const [toUnit, setToUnit] = useState(DEFAULT_UNITS.length[1]);
  const [inputValue, setInputValue] = useState('1');
  const [precision, setPrecision] = useState(4);
  const [copyStatus, setCopyStatus] = useState('');

  const parsedValue = parseConversionValue(inputValue);
  const result = useMemo(() => {
    if (parsedValue === null) return null;
    return convertUnit(parsedValue, category, fromUnit, toUnit);
  }, [category, fromUnit, parsedValue, toUnit]);

  const categoryUnits = UNIT_CATEGORIES[category].units;
  const resultText = result === null ? '' : formatConversionResult(result, precision);

  function handleCategoryChange(nextCategory) {
    setCategory(nextCategory);
    setFromUnit(DEFAULT_UNITS[nextCategory][0]);
    setToUnit(DEFAULT_UNITS[nextCategory][1]);
    setCopyStatus('');
  }

  function handleSwap() {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
    setCopyStatus('');
  }

  async function handleCopy() {
    if (!resultText) return;
    try {
      await navigator.clipboard.writeText(resultText);
      setCopyStatus('Result copied to clipboard.');
    } catch {
      setCopyStatus('Unable to copy the result.');
    }
  }

  return (
    <section className="unit-converter" aria-label="Unit Converter Tool">
      <header className="unit-converter__intro">
        <p className="unit-converter__eyebrow">EVERYDAY CONVERSIONS</p>
        <h2>Unit Converter</h2>
        <p>Convert length, weight, temperature, and volume measurements instantly.</p>
      </header>

      <div className="unit-converter__controls">
        <label htmlFor="unit-category">Category</label>
        <select
          id="unit-category"
          aria-label="Conversion category"
          value={category}
          onChange={(event) => handleCategoryChange(event.target.value)}
        >
          {Object.entries(UNIT_CATEGORIES).map(([id, details]) => (
            <option key={id} value={id}>{details.label}</option>
          ))}
        </select>

        <label htmlFor="unit-input">Value</label>
        <input
          id="unit-input"
          aria-label="Value to convert"
          inputMode="decimal"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          aria-invalid={parsedValue === null || undefined}
          placeholder="Enter a number"
        />

        <div className="unit-converter__unit-row">
          <label htmlFor="from-unit">From unit</label>
          <select
            id="from-unit"
            aria-label="From unit"
            value={fromUnit}
            onChange={(event) => setFromUnit(event.target.value)}
          >
            {categoryUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="unit-converter__swap"
            onClick={handleSwap}
            aria-label="Swap units"
          >
            ⇄
          </button>
          <label htmlFor="to-unit">To unit</label>
          <select
            id="to-unit"
            aria-label="To unit"
            value={toUnit}
            onChange={(event) => setToUnit(event.target.value)}
          >
            {categoryUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.label}</option>
            ))}
          </select>
        </div>

        <label htmlFor="unit-precision">Decimal places</label>
        <select
          id="unit-precision"
          aria-label="Decimal places"
          value={precision}
          onChange={(event) => setPrecision(Number(event.target.value))}
        >
          {[0, 1, 2, 3, 4, 5, 6].map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </div>

      {parsedValue === null && (
        <p className="unit-converter__error" role="alert">Enter a valid number.</p>
      )}

      <section className="unit-converter__result" aria-labelledby="unit-result-title">
        <p className="unit-converter__eyebrow">RESULT</p>
        <h3 id="unit-result-title">{resultText || '—'}</h3>
        <button type="button" onClick={handleCopy} disabled={!resultText} aria-label="Copy result">
          Copy result
        </button>
      </section>

      <p className="unit-converter__status" aria-live="polite">{copyStatus}</p>
    </section>
  );
}
