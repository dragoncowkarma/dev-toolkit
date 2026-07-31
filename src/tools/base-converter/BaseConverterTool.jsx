import { useEffect, useMemo, useState } from 'react';
import {
  convertBase,
  getBinaryRepresentation,
  validateBaseInput,
} from './baseConverter.utils.js';
import './baseConverter.css';

const STANDARD_BASES = [
  { key: 'bin', label: 'BIN', base: 2 },
  { key: 'oct', label: 'OCT', base: 8 },
  { key: 'dec', label: 'DEC', base: 10 },
  { key: 'hex', label: 'HEX', base: 16 },
];

const EMPTY_VALUES = { bin: '', oct: '', dec: '', hex: '' };
const BIT_WIDTHS = [8, 16, 32];

function synchronizeValues(value, fromBase) {
  const decimal = convertBase(value, fromBase, 10);
  return STANDARD_BASES.reduce((values, field) => {
    values[field.key] = convertBase(decimal, 10, field.base);
    return values;
  }, {});
}

/**
 * Renders synchronized base inputs, custom conversion, and two's-complement bit views.
 *
 * @returns {React.JSX.Element} The Base Converter tool UI.
 */
export default function BaseConverterTool() {
  const [values, setValues] = useState(EMPTY_VALUES);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState('');
  const [copiedField, setCopiedField] = useState('');
  const [copyError, setCopyError] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [customFromBase, setCustomFromBase] = useState('10');
  const [customToBase, setCustomToBase] = useState('16');
  const [customResult, setCustomResult] = useState('');
  const [customError, setCustomError] = useState('');

  const decimalValue = validateBaseInput(values.dec, 10) ? values.dec : '0';
  const binaryViews = useMemo(() => getBinaryRepresentation(decimalValue), [decimalValue]);

  useEffect(() => {
    if (!copiedField) return undefined;
    const timer = setTimeout(() => setCopiedField(''), 1500);
    return () => clearTimeout(timer);
  }, [copiedField]);

  function handleValueChange(field, value) {
    if (value === '') {
      setValues(EMPTY_VALUES);
      setError('');
      setInvalidField('');
      return;
    }
    if (!validateBaseInput(value, field.base)) {
      setValues((current) => ({ ...current, [field.key]: value }));
      setError(`${field.label} accepts valid base-${field.base} digits only.`);
      setInvalidField(field.key);
      return;
    }

    setValues(synchronizeValues(value, field.base));
    setError('');
    setInvalidField('');
  }

  function handleBitToggle(width, position) {
    const bitIndex = BigInt(width - position - 1);
    const toggled = BigInt(decimalValue) ^ (1n << bitIndex);
    setValues(synchronizeValues(toggled.toString(), 10));
    setError('');
    setInvalidField('');
  }

  async function handleCopy(field) {
    if (!values[field.key]) return;
    try {
      await navigator.clipboard.writeText(values[field.key]);
      setCopiedField(field.key);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  function handleCustomConvert(event) {
    event.preventDefault();
    const fromBase = Number(customFromBase);
    const toBase = Number(customToBase);
    if (!validateBaseInput(customValue, fromBase)) {
      setCustomResult('');
      setCustomError('Enter a valid value and bases between 2 and 36.');
      return;
    }
    try {
      setCustomResult(convertBase(customValue, fromBase, toBase));
      setCustomError('');
    } catch (conversionError) {
      setCustomResult('');
      setCustomError(conversionError.message);
    }
  }

  const alertMessage = error || copyError || customError;

  return (
    <section className="base-converter" aria-label="Base Converter Tool">
      <header className="base-converter__intro">
        <p className="base-converter__eyebrow">NUMBER SYSTEMS</p>
        <h2>Base Converter</h2>
        <p>
          Convert whole numbers across common bases and inspect their two&apos;s-complement bits.
        </p>
      </header>

      <div className="base-converter__fields" aria-label="Standard base conversions">
        {STANDARD_BASES.map((field) => (
          <div className="base-converter__field" key={field.key}>
            <label htmlFor={`base-converter-${field.key}`}>{field.label}</label>
            <div className="base-converter__input-row">
              <input
                id={`base-converter-${field.key}`}
                value={values[field.key]}
                onChange={(event) => handleValueChange(field, event.target.value)}
                inputMode="text"
                spellCheck={false}
                aria-invalid={invalidField === field.key ? true : undefined}
                placeholder="0"
              />
              <button
                type="button"
                onClick={() => handleCopy(field)}
                disabled={!values[field.key]}
                aria-label={
                  copiedField === field.key ? `${field.label} copied` : `Copy ${field.label}`
                }
              >
                {copiedField === field.key ? '✓' : 'Copy'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <section className="base-converter__bit-viewer" aria-labelledby="bit-viewer-title">
        <div className="base-converter__section-heading">
          <div>
            <p className="base-converter__eyebrow">BIT VIEWER</p>
            <h3 id="bit-viewer-title">Two&apos;s-complement representation</h3>
          </div>
          <span>Click any bit to toggle it</span>
        </div>
        <div className="base-converter__bit-panels">
          {BIT_WIDTHS.map((width) => {
            const representation = binaryViews[`bit${width}`];
            return (
              <article className="base-converter__bit-panel" key={width}>
                <div className="base-converter__bit-panel-header">
                  <strong>{width}-bit</strong>
                  <span>Unsigned {representation.unsigned} · Signed {representation.signed}</span>
                </div>
                <div className="base-converter__bits" aria-label={`${width}-bit binary value`}>
                  {[...representation.binary].map((bit, position) => (
                    <button
                      type="button"
                      className={bit === '1' ? 'base-converter__bit active' : 'base-converter__bit'}
                      key={`${width}-${position}`}
                      onClick={() => handleBitToggle(width, position)}
                      aria-label={`Toggle bit ${width - position - 1} in ${width}-bit view`}
                      aria-pressed={bit === '1'}
                    >
                      {bit}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <form className="base-converter__custom" onSubmit={handleCustomConvert}>
        <div className="base-converter__section-heading">
          <div>
            <p className="base-converter__eyebrow">CUSTOM BASE</p>
            <h3>Convert between bases 2–36</h3>
          </div>
        </div>
        <label>
          Value
          <input value={customValue} onChange={(event) => setCustomValue(event.target.value)} />
        </label>
        <label>
          From base
          <input
            type="number"
            min="2"
            max="36"
            value={customFromBase}
            onChange={(event) => setCustomFromBase(event.target.value)}
          />
        </label>
        <label>
          To base
          <input
            type="number"
            min="2"
            max="36"
            value={customToBase}
            onChange={(event) => setCustomToBase(event.target.value)}
          />
        </label>
        <button type="submit">Convert</button>
        <output aria-label="Custom conversion result">{customResult || '—'}</output>
      </form>

      {alertMessage && <div className="base-converter__error" role="alert">⚠ {alertMessage}</div>}
    </section>
  );
}
