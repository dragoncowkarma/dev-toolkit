import { useEffect, useState } from 'react';
import {
  decodeHtmlEntities,
  encodeHtmlEntities,
  ENTITY_MODES,
  ENTITY_SCOPES,
} from './htmlEntity.utils.js';
import './htmlEntity.css';

const CONVERSION_MODES = {
  ENCODE: 'encode',
  DECODE: 'decode',
};

/**
 * Renders an HTML entity encoder and decoder with live conversion controls.
 *
 * @returns {React.JSX.Element} The HTML entity tool UI.
 */
export default function HtmlEntityTool() {
  const [conversionMode, setConversionMode] = useState(CONVERSION_MODES.ENCODE);
  const [entityMode, setEntityMode] = useState(ENTITY_MODES.NAMED);
  const [scope, setScope] = useState(ENTITY_SCOPES.RESERVED);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setOutput(
      conversionMode === CONVERSION_MODES.ENCODE
        ? encodeHtmlEntities(input, entityMode, scope)
        : decodeHtmlEntities(input)
    );
  }, [conversionMode, entityMode, input, scope]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 1500);
    return () => clearTimeout(timer);
  }, [notice]);

  const isEncoding = conversionMode === CONVERSION_MODES.ENCODE;

  function handleClear() {
    setInput('');
    setOutput('');
    setNotice('Cleared.');
  }

  function handleSwap() {
    setInput(output);
    setConversionMode(isEncoding ? CONVERSION_MODES.DECODE : CONVERSION_MODES.ENCODE);
  }

  async function handleCopy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setNotice('Copied to clipboard.');
    } catch {
      setNotice('Unable to copy to clipboard.');
    }
  }

  return (
    <section className="html-entity-tool" aria-label="HTML Entity Encoder/Decoder Tool">
      <div className="html-entity-tool__toolbar">
        <div className="html-entity-tool__toggle" role="group" aria-label="Conversion direction">
          <button
            type="button"
            className={isEncoding ? 'is-active' : ''}
            aria-pressed={isEncoding}
            onClick={() => setConversionMode(CONVERSION_MODES.ENCODE)}
          >
            Encode
          </button>
          <button
            type="button"
            className={!isEncoding ? 'is-active' : ''}
            aria-pressed={!isEncoding}
            onClick={() => setConversionMode(CONVERSION_MODES.DECODE)}
          >
            Decode
          </button>
        </div>

        <div className="html-entity-tool__actions">
          <button
            type="button"
            className="html-entity-tool__button"
            onClick={handleSwap}
            disabled={!output}
          >
            ⇅ Swap
          </button>
          <button type="button" className="html-entity-tool__button" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      {isEncoding && (
        <div className="html-entity-tool__options" aria-label="Encoding options">
          <label>
            Entity format
            <select value={entityMode} onChange={(event) => setEntityMode(event.target.value)}>
              <option value={ENTITY_MODES.NAMED}>Named (&amp;lt;)</option>
              <option value={ENTITY_MODES.DECIMAL}>Decimal (&amp;#60;)</option>
              <option value={ENTITY_MODES.HEX}>Hexadecimal (&amp;#x3c;)</option>
            </select>
          </label>
          <label>
            Character scope
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value={ENTITY_SCOPES.RESERVED}>HTML reserved characters</option>
              <option value={ENTITY_SCOPES.ALL}>All characters</option>
            </select>
          </label>
          {entityMode === ENTITY_MODES.NAMED && scope === ENTITY_SCOPES.ALL && (
            <p>Reserved characters use names; remaining characters use decimal entities.</p>
          )}
        </div>
      )}

      <div className="html-entity-tool__panels">
        <div className="html-entity-tool__panel">
          <label htmlFor="html-entity-input">
            {isEncoding ? 'Plain text' : 'HTML entities'}
          </label>
          <textarea
            id="html-entity-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={isEncoding ? 'Type text to encode…' : 'Paste HTML entities to decode…'}
            spellCheck={false}
          />
        </div>
        <div className="html-entity-tool__panel">
          <div className="html-entity-tool__output-label">
            <label htmlFor="html-entity-output">
              {isEncoding ? 'HTML entities' : 'Plain text'}
            </label>
            <button
              type="button"
              className="html-entity-tool__button"
              onClick={handleCopy}
              disabled={!output}
            >
              Copy
            </button>
          </div>
          <textarea
            id="html-entity-output"
            value={output}
            readOnly
            placeholder="Result will appear here…"
            spellCheck={false}
          />
        </div>
      </div>

      <p className="html-entity-tool__notice" role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}
