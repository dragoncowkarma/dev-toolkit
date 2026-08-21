import { useState } from 'react';
import { fromRoman, toRoman } from './roman-numeral.utils.js';
import './roman-numeral.css';

const ARABIC_ERROR = 'Enter a whole number from 1 to 3999.';
const ROMAN_ERROR = 'Enter a standard Roman numeral from I to MMMCMXCIX.';

/**
 * Renders an instant, client-side converter between Arabic and Roman numerals.
 *
 * @returns {React.JSX.Element} The Roman Numeral Converter interface.
 */
export default function RomanNumeralTool() {
  const [arabic, setArabic] = useState('');
  const [roman, setRoman] = useState('');
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState('');

  function handleArabicChange(value) {
    setArabic(value);

    if (!value) {
      setRoman('');
      setError('');
      setInvalidField('');
      return;
    }

    const isIntegerText = /^\d+$/.test(value);
    const converted = isIntegerText ? toRoman(Number(value)) : null;
    if (!converted) {
      setRoman('');
      setError(ARABIC_ERROR);
      setInvalidField('arabic');
      return;
    }

    setRoman(converted);
    setError('');
    setInvalidField('');
  }

  function handleRomanChange(value) {
    setRoman(value);

    if (!value) {
      setArabic('');
      setError('');
      setInvalidField('');
      return;
    }

    const converted = fromRoman(value);
    if (converted === null) {
      setArabic('');
      setError(ROMAN_ERROR);
      setInvalidField('roman');
      return;
    }

    setArabic(String(converted));
    setError('');
    setInvalidField('');
  }

  function clearInputs() {
    setArabic('');
    setRoman('');
    setError('');
    setInvalidField('');
  }

  return (
    <section className="roman-numeral-tool" aria-label="Roman Numeral Converter">
      <header className="roman-numeral-tool__intro">
        <p className="roman-numeral-tool__eyebrow">NUMBER SYSTEMS</p>
        <h2>Roman Numeral Converter</h2>
        <p>Convert Arabic integers and standard Roman numerals instantly in your browser.</p>
      </header>

      <div className="roman-numeral-tool__controls">
        <p>Standard subtractive notation: I to MMMCMXCIX.</p>
        <button type="button" onClick={clearInputs}>Clear</button>
      </div>

      <div className="roman-numeral-tool__fields">
        <div className="roman-numeral-tool__field">
          <label htmlFor="roman-numeral-arabic">Arabic number</label>
          <input
            id="roman-numeral-arabic"
            value={arabic}
            onChange={(event) => handleArabicChange(event.target.value)}
            inputMode="numeric"
            placeholder="e.g. 1994"
            aria-invalid={invalidField === 'arabic' || undefined}
            aria-describedby={error ? 'roman-numeral-error' : undefined}
          />
          <p>Whole numbers from 1 to 3999.</p>
        </div>

        <span className="roman-numeral-tool__arrow" aria-hidden="true">⇄</span>

        <div className="roman-numeral-tool__field">
          <label htmlFor="roman-numeral-roman">Roman numeral</label>
          <input
            id="roman-numeral-roman"
            value={roman}
            onChange={(event) => handleRomanChange(event.target.value)}
            placeholder="e.g. MCMXCIV"
            spellCheck={false}
            aria-invalid={invalidField === 'roman' || undefined}
            aria-describedby={error ? 'roman-numeral-error' : undefined}
          />
          <p>Standard notation, case-insensitive.</p>
        </div>
      </div>

      {error && (
        <div id="roman-numeral-error" className="roman-numeral-tool__error" role="alert">
          {error}
        </div>
      )}

      {!error && (arabic || roman) && (
        <p className="roman-numeral-tool__result" aria-live="polite">
          Conversion updated: {arabic} = {roman.toUpperCase()}
        </p>
      )}
    </section>
  );
}
