import { useEffect, useMemo, useState } from 'react';
import { CASE_DEFINITIONS, convertToAllCases } from './caseConverter.utils.js';
import './caseConverter.css';

/**
 * Renders a text case converter with simultaneous camelCase, PascalCase,
 * snake_case, kebab-case, CONSTANT_CASE, Title Case, lower case, and
 * UPPER CASE output, each with its own copy-to-clipboard action.
 *
 * @returns {React.JSX.Element} The case converter tool UI.
 */
export default function CaseConverterTool() {
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState('');

  const results = useMemo(() => {
    const converted = convertToAllCases(input);
    return CASE_DEFINITIONS.map((definition) => ({
      ...definition,
      value: converted[definition.id],
    }));
  }, [input]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 1500);
    return () => clearTimeout(timer);
  }, [notice]);

  function handleClear() {
    setInput('');
    setNotice('Cleared.');
  }

  async function handleCopy(label, value) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`Copied ${label} to clipboard.`);
    } catch {
      setNotice('Unable to copy to clipboard.');
    }
  }

  return (
    <section className="case-converter-tool" aria-label="Case Converter Tool">
      <div className="case-converter-tool__toolbar">
        <div className="case-converter-tool__panel">
          <label htmlFor="case-converter-input">Input text</label>
          <textarea
            id="case-converter-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Type or paste identifiers or phrases, one per line…"
            spellCheck={false}
          />
        </div>
        <div className="case-converter-tool__actions">
          <button type="button" className="case-converter-tool__button" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="case-converter-tool__results">
        {results.map(({ id, label, value }) => (
          <div className="case-converter-tool__result" key={id}>
            <div className="case-converter-tool__result-header">
              <label htmlFor={`case-converter-output-${id}`}>{label}</label>
              <button
                type="button"
                className="case-converter-tool__button"
                onClick={() => handleCopy(label, value)}
                disabled={!value}
              >
                Copy
              </button>
            </div>
            <textarea
              id={`case-converter-output-${id}`}
              value={value}
              readOnly
              placeholder="Result will appear here…"
              spellCheck={false}
            />
          </div>
        ))}
      </div>

      <p className="case-converter-tool__notice" role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}
