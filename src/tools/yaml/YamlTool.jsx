import { useEffect, useMemo, useState } from 'react';
import { jsonToYaml, yamlToJson } from './yaml.utils.js';
import './yaml.css';

const DIRECTIONS = {
  YAML_TO_JSON: 'yaml-to-json',
  JSON_TO_YAML: 'json-to-yaml',
};

const YAML_SAMPLE = `project:
  name: Dev Toolkit
  enabled: true
  formats:
    - YAML
    - JSON
  settings:
    indent: 2`;

const JSON_SAMPLE = `{
  "project": {
    "name": "Dev Toolkit",
    "enabled": true,
    "formats": ["YAML", "JSON"],
    "settings": {
      "indent": 2
    }
  }
}`;

function labelsFor(direction) {
  return direction === DIRECTIONS.YAML_TO_JSON
    ? { input: 'YAML input', output: 'JSON output' }
    : { input: 'JSON input', output: 'YAML output' };
}

function fileDetailsFor(direction) {
  return direction === DIRECTIONS.YAML_TO_JSON
    ? { extension: 'json', type: 'application/json' }
    : { extension: 'yaml', type: 'text/yaml' };
}

function errorHeading(error) {
  if (error?.kind === 'conversion') {
    return `Cannot convert this ${error.format} input without data loss.`;
  }
  return `${error?.format || 'Input'} input is invalid.`;
}

/**
 * Renders a responsive, real-time converter between YAML and JSON text.
 *
 * @returns {React.JSX.Element} The YAML converter UI.
 */
export default function YamlTool() {
  const [direction, setDirection] = useState(DIRECTIONS.YAML_TO_JSON);
  const [input, setInput] = useState(YAML_SAMPLE);
  const [indent, setIndent] = useState(2);
  const [copyStatus, setCopyStatus] = useState('');

  const result = useMemo(() => {
    if (!input.trim()) return { output: '', error: null };

    try {
      const output = direction === DIRECTIONS.YAML_TO_JSON
        ? yamlToJson(input)
        : jsonToYaml(input, indent);
      return { output, error: null };
    } catch (error) {
      return { output: '', error };
    }
  }, [direction, indent, input]);

  useEffect(() => {
    if (!copyStatus) return undefined;
    const timeout = setTimeout(() => setCopyStatus(''), 1800);
    return () => clearTimeout(timeout);
  }, [copyStatus]);

  const labels = labelsFor(direction);
  const canUseOutput = Boolean(result.output && !result.error);

  function changeDirection(nextDirection) {
    if (nextDirection === direction) return;
    setInput(result.error ? '' : result.output);
    setDirection(nextDirection);
    setCopyStatus('');
  }

  function loadSample() {
    setInput(direction === DIRECTIONS.YAML_TO_JSON ? YAML_SAMPLE : JSON_SAMPLE);
    setCopyStatus('');
  }

  function clearInput() {
    setInput('');
    setCopyStatus('');
  }

  function formatYamlInput() {
    if (direction !== DIRECTIONS.YAML_TO_JSON || !canUseOutput) return;
    setInput(jsonToYaml(result.output, indent));
    setCopyStatus('');
  }

  async function copyOutput() {
    if (!canUseOutput) return;

    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable.');
      await navigator.clipboard.writeText(result.output);
      setCopyStatus('Copied output to clipboard.');
    } catch {
      setCopyStatus('Could not copy output to clipboard.');
    }
  }

  function downloadOutput() {
    if (!canUseOutput) return;

    const fileDetails = fileDetailsFor(direction);
    const blob = new Blob([result.output], { type: fileDetails.type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `converted.${fileDetails.extension}`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="yaml-tool" aria-label="YAML Converter">
      <header className="yaml-tool__intro">
        <p className="yaml-tool__eyebrow">Formatter</p>
        <h2>YAML Converter</h2>
        <p>Convert and validate JSON-compatible YAML and JSON in real time.</p>
      </header>

      <div className="yaml-tool__controls">
        <div className="yaml-tool__mode" role="group" aria-label="Conversion direction">
          <button
            type="button"
            aria-pressed={direction === DIRECTIONS.YAML_TO_JSON}
            className={direction === DIRECTIONS.YAML_TO_JSON ? 'is-active' : ''}
            onClick={() => changeDirection(DIRECTIONS.YAML_TO_JSON)}
          >
            YAML to JSON
          </button>
          <button
            type="button"
            aria-pressed={direction === DIRECTIONS.JSON_TO_YAML}
            className={direction === DIRECTIONS.JSON_TO_YAML ? 'is-active' : ''}
            onClick={() => changeDirection(DIRECTIONS.JSON_TO_YAML)}
          >
            JSON to YAML
          </button>
        </div>

        <label className="yaml-tool__indent" htmlFor="yaml-indent">
          YAML indentation
          <select
            id="yaml-indent"
            value={indent}
            onChange={(event) => setIndent(Number(event.target.value))}
            aria-label="YAML indentation"
          >
            <option value="2">2 spaces</option>
            <option value="4">4 spaces</option>
          </select>
        </label>

        <div className="yaml-tool__actions">
          <button type="button" onClick={loadSample}>Load sample</button>
          <button
            type="button"
            onClick={formatYamlInput}
            disabled={direction !== DIRECTIONS.YAML_TO_JSON || !canUseOutput}
          >
            Format YAML
          </button>
          <button type="button" onClick={clearInput}>Clear</button>
        </div>
      </div>

      <div className="yaml-tool__panes">
        <div className="yaml-tool__pane">
          <label htmlFor="yaml-converter-input">{labels.input}</label>
          <textarea
            id="yaml-converter-input"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setCopyStatus('');
            }}
            placeholder={`Paste ${labels.input.toLowerCase()} here...`}
            spellCheck="false"
            aria-label={labels.input}
          />
        </div>

        <div className="yaml-tool__pane yaml-tool__pane--output">
          <div className="yaml-tool__output-heading">
            <label htmlFor="yaml-converter-output">{labels.output}</label>
            <div>
              <button
                type="button"
                onClick={copyOutput}
                disabled={!canUseOutput}
                aria-label="Copy converted output"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={downloadOutput}
                disabled={!canUseOutput}
                aria-label="Download converted output"
              >
                Download
              </button>
            </div>
          </div>
          <textarea
            id="yaml-converter-output"
            value={result.output}
            readOnly
            placeholder="Converted result appears here..."
            spellCheck="false"
            aria-label={labels.output}
          />
        </div>
      </div>

      {result.error && (
        <div className="yaml-tool__error" role="alert">
          <strong>{errorHeading(result.error)}</strong>
          <span>Line {result.error.line}, column {result.error.column}: {result.error.reason}</span>
        </div>
      )}

      {copyStatus && (
        <p
          className="yaml-tool__status"
          role={copyStatus.startsWith('Could not') ? 'alert' : 'status'}
          aria-live="polite"
        >
          {copyStatus}
        </p>
      )}
    </section>
  );
}
