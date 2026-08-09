import { useEffect, useState } from 'react';
import { generateTypeScript } from './jsonTypeGenerator.utils.js';
import './jsonTypeGenerator.css';

const SAMPLE = `{
  "id": 42,
  "name": "Ada Lovelace",
  "active": true,
  "tags": ["math", "programming"],
  "projects": [
    { "name": "Analytical Engine", "year": 1843 },
    { "name": "Notes", "published": true }
  ]
}`;

/** Renders a live JSON-to-TypeScript declaration generator. */
export default function JsonTypeGeneratorTool() {
  const [source, setSource] = useState('');
  const [settings, setSettings] = useState({ rootName: 'Root', declaration: 'interface', optionalProperties: true, readonly: false, indent: '  ' });
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const result = generateTypeScript(source, settings);
    setError(result.error);
    if (!result.error) setOutput(result.output);
    setFeedback(result.error ? '' : result.output ? 'Type declaration generated.' : '');
  }, [source, settings]);

  function updateSetting(event) {
    const { name, type, checked, value } = event.target;
    setSettings((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    setFeedback('');
  }

  function loadSample() {
    setSource(SAMPLE);
    setFeedback('Sample loaded and declaration generated.');
  }

  function clearTool() {
    setSource('');
    setOutput('');
    setError('');
    setFeedback('Cleared.');
  }

  async function copyOutput() {
    if (!output) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(output);
      setFeedback('Type declaration copied to clipboard.');
    } catch {
      setFeedback('Unable to copy the type declaration.');
    }
  }

  return (
    <section className="json-type-generator" aria-labelledby="json-type-generator-title">
      <header className="json-type-generator__intro">
        <p className="json-type-generator__eyebrow">JSON</p>
        <h2 id="json-type-generator-title">JSON Type Generator</h2>
        <p>Create deterministic TypeScript declarations from a JSON sample.</p>
      </header>
      <div className="json-type-generator__actions">
        <button type="button" onClick={loadSample} aria-label="Load representative JSON sample">Load sample</button>
        <button type="button" onClick={clearTool} aria-label="Clear JSON input and generated declaration">Clear</button>
      </div>
      <fieldset className="json-type-generator__settings">
        <legend>Declaration settings</legend>
        <label>Root type name<input name="rootName" value={settings.rootName} onChange={updateSetting} aria-label="Root type name" /></label>
        <label>Declaration<select name="declaration" value={settings.declaration} onChange={updateSetting} aria-label="Declaration style"><option value="interface">Interface</option><option value="type">Type alias</option></select></label>
        <label>Indentation<select name="indent" value={settings.indent} onChange={updateSetting} aria-label="Indentation"><option value="  ">2 spaces</option><option value="    ">4 spaces</option><option value="\t">Tab</option></select></label>
        <label><input type="checkbox" name="optionalProperties" checked={settings.optionalProperties} onChange={updateSetting} /> Optional properties</label>
        <label><input type="checkbox" name="readonly" checked={settings.readonly} onChange={updateSetting} /> Readonly properties</label>
      </fieldset>
      <div className="json-type-generator__panes">
        <div className="json-type-generator__pane"><label htmlFor="json-type-input">Sample JSON</label><textarea id="json-type-input" value={source} onChange={(event) => setSource(event.target.value)} aria-label="Sample JSON" placeholder="Paste JSON here" spellCheck="false" /></div>
        <div className="json-type-generator__pane"><div className="json-type-generator__output-heading"><label htmlFor="json-type-output">TypeScript declaration</label><button type="button" onClick={copyOutput} disabled={!output} aria-label="Copy TypeScript declaration">Copy</button></div><textarea id="json-type-output" value={output} readOnly aria-label="TypeScript declaration" placeholder="Your declaration will appear here" spellCheck="false" /></div>
      </div>
      {error && <p className="json-type-generator__error" role="alert">{error}</p>}
      {feedback && <p className="json-type-generator__status" role="status" aria-live="polite">{feedback}</p>}
    </section>
  );
}
