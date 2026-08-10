import { useEffect, useState } from 'react';
import { escapeString, LANGUAGES, unescapeString } from './stringEscaper.utils.js';
import './stringEscaper.css';

const PRESETS = [
  { label: 'Quotes', value: 'She said "hello" and it\'s fine.' },
  { label: 'Multiline', value: 'First line\nSecond\tline' },
  { label: 'Unicode', value: 'Hello, 안녕! 🚀' },
];

const LANGUAGE_OPTIONS = [
  [LANGUAGES.JAVASCRIPT, 'JavaScript / JSON'], [LANGUAGES.HTML, 'HTML'],
  [LANGUAGES.SQL, 'SQL'], [LANGUAGES.JAVA, 'Java / C#'], [LANGUAGES.PYTHON, 'Python'],
];

/** Renders a live multi-language string escaping and unescaping workspace. */
export default function StringEscaperTool() {
  const [mode, setMode] = useState('escape');
  const [language, setLanguage] = useState(LANGUAGES.JAVASCRIPT);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [quoteStyle, setQuoteStyle] = useState('double');
  const [escapeUnicode, setEscapeUnicode] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try {
      setOutput(mode === 'escape'
        ? escapeString(input, language, { quoteStyle, escapeUnicode })
        : unescapeString(input, language));
      setNotice('');
    } catch (error) { setOutput(''); setNotice(error.message); }
  }, [mode, language, input, quoteStyle, escapeUnicode]);

  async function handleCopy() {
    if (!output) return;
    try { await navigator.clipboard.writeText(output); setNotice('Copied to clipboard.'); }
    catch { setNotice('Unable to copy to clipboard.'); }
  }

  const isEscape = mode === 'escape';
  return <section className="string-escaper" aria-label="String Escaper Tool">
    <div className="string-escaper__toolbar">
      <div className="string-escaper__toggle" role="group" aria-label="Conversion mode">
        {['escape', 'unescape'].map((value) => <button key={value} type="button"
          className={mode === value ? 'is-active' : ''} aria-pressed={mode === value}
          onClick={() => setMode(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
      </div>
      <label className="string-escaper__language">Target language
        <select value={language} onChange={(event) => setLanguage(event.target.value)}>
          {LANGUAGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </div>
    <div className="string-escaper__options" aria-label="Escape options">
      <label>Quote style <select value={quoteStyle} onChange={(event) => setQuoteStyle(event.target.value)}>
        <option value="double">Double quotes</option><option value="single">Single quotes</option>
      </select></label>
      <label className="string-escaper__checkbox"><input type="checkbox" checked={escapeUnicode}
        onChange={(event) => setEscapeUnicode(event.target.checked)} /> Escape Unicode characters</label>
    </div>
    <div className="string-escaper__presets" aria-label="Sample presets"><span>Samples:</span>
      {PRESETS.map((preset) => <button type="button" key={preset.label} onClick={() => setInput(preset.value)}>{preset.label}</button>)}
    </div>
    <div className="string-escaper__panels">
      <div className="string-escaper__panel"><label htmlFor="string-escaper-input">{isEscape ? 'Plain text' : 'Escaped text'}</label>
        <textarea id="string-escaper-input" value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false}
          placeholder={isEscape ? 'Type text to escape…' : 'Paste escaped text to unescape…'} /></div>
      <div className="string-escaper__panel"><div className="string-escaper__output-label"><label htmlFor="string-escaper-output">{isEscape ? 'Escaped result' : 'Plain text'}</label>
        <button type="button" onClick={handleCopy} disabled={!output}>Copy</button></div>
        <textarea id="string-escaper-output" value={output} readOnly spellCheck={false} placeholder="Result will appear here…" /></div>
    </div>
    <p className="string-escaper__notice" role="status" aria-live="polite">{notice}</p>
  </section>;
}
