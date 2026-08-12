import { useMemo, useState } from 'react';
import { evaluateCsp, parseCsp, serializeCspHeader } from './csp.utils.js';
import './csp.css';

const PARSER_SAMPLE = "default-src 'self'; script-src 'self' 'unsafe-inline' "
  + 'https://cdn.example.com; img-src *';

const PRESETS = {
  strict: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'nonce-your-nonce'"],
    'style-src': ["'self'"],
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'upgrade-insecure-requests': [],
  },
  spa: {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", 'https://api.example.com'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'frame-ancestors': ["'none'"],
  },
  reportOnly: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'nonce-your-nonce'"],
    'style-src': ["'self'"],
    'img-src': ["'self'", 'data:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'frame-ancestors': ["'none'"],
    'report-uri': ['https://reports.example.com/csp'],
  },
};

const DIRECTIVES = [
  'default-src', 'script-src', 'style-src', 'img-src', 'font-src', 'connect-src',
  'frame-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors',
];
const BOOLEAN_DIRECTIVES = ['upgrade-insecure-requests', 'block-all-mixed-content'];

const LEVEL_TEXT = {
  HIGH: 'High risk',
  MEDIUM: 'Medium risk',
  LOW: 'Low risk',
  PASS: 'Pass',
};

function splitSourceInput(value) {
  return value.split(/[\s,]+/).map((source) => source.trim()).filter(Boolean);
}

function updateSource(directives, directive, source, enabled) {
  const sources = directives[directive] ?? [];
  const nextSources = enabled
    ? [...new Set([...sources, source])]
    : sources.filter((item) => item !== source);
  return nextSources.length ? { ...directives, [directive]: nextSources } : Object.fromEntries(
    Object.entries(directives).filter(([name]) => name !== directive),
  );
}

/** Renders a local CSP parser, risk evaluator, and policy builder. */
export default function CspTool() {
  const [mode, setMode] = useState('parser');
  const [rawInput, setRawInput] = useState('');
  const [builderDirectives, setBuilderDirectives] = useState(PRESETS.strict);
  const [reportOnly, setReportOnly] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const parsed = useMemo(() => parseCsp(rawInput), [rawInput]);
  const parserAssessment = useMemo(() => evaluateCsp(parsed.directives), [parsed.directives]);
  const builderOutput = useMemo(() => {
    const policy = serializeCspHeader(builderDirectives, { includeHeader: false });
    if (!policy) return '';
    const headerName = reportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';
    return `${headerName}: ${policy}`;
  }, [builderDirectives, reportOnly]);

  function loadParserSample() {
    setRawInput(PARSER_SAMPLE);
    setCopyStatus('');
  }

  function clearParser() {
    setRawInput('');
    setCopyStatus('');
  }

  function loadPreset(preset) {
    setBuilderDirectives(PRESETS[preset]);
    setReportOnly(preset === 'reportOnly');
    setCopyStatus('');
  }

  function toggleDirective(directive, enabled) {
    setBuilderDirectives((current) => {
      if (enabled) return { ...current, [directive]: current[directive] ?? [] };
      return Object.fromEntries(Object.entries(current).filter(([name]) => name !== directive));
    });
  }

  function toggleCommonSource(directive, source, enabled) {
    setBuilderDirectives((current) => updateSource(current, directive, source, enabled));
  }

  function setCustomSources(directive, value) {
    setBuilderDirectives((current) => {
      const common = (current[directive] ?? []).filter((source) => (
        source === "'self'" || source === "'unsafe-inline'"
      ));
      const sources = [...new Set([...common, ...splitSourceInput(value)])];
      return sources.length ? { ...current, [directive]: sources } : current;
    });
  }

  function clearBuilder() {
    setBuilderDirectives({});
    setReportOnly(false);
    setCopyStatus('');
  }

  async function copyHeader() {
    try {
      await navigator.clipboard.writeText(builderOutput);
      setCopyStatus('CSP header copied to clipboard.');
    } catch {
      setCopyStatus('Unable to copy the CSP header to the clipboard.');
    }
  }

  return (
    <section className="csp-tool" aria-label="CSP Generator and Evaluator Tool">
      <header className="csp-tool__intro">
        <p className="csp-tool__eyebrow">Reference</p>
        <h2>Content Security Policy</h2>
        <p>Parse, assess, and build CSP headers locally in your browser.</p>
      </header>

      <div className="csp-tool__mode" role="tablist" aria-label="CSP tool mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'parser'}
          onClick={() => setMode('parser')}
        >
          Parser / Evaluator
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'generator'}
          onClick={() => setMode('generator')}
        >
          Generator / Builder
        </button>
      </div>

      {mode === 'parser' ? (
        <div className="csp-tool__panel" role="tabpanel" aria-label="Parser and evaluator">
          <div className="csp-tool__actions">
            <button type="button" onClick={loadParserSample} aria-label="Load CSP sample policy">
              Load sample
            </button>
            <button type="button" onClick={clearParser} aria-label="Clear CSP parser input">
              Clear
            </button>
          </div>
          <label htmlFor="csp-raw-input">Raw CSP header or policy</label>
          <textarea
            id="csp-raw-input"
            className="csp-tool__textarea"
            value={rawInput}
            onChange={(event) => setRawInput(event.target.value)}
            placeholder="Content-Security-Policy: default-src 'self'; object-src 'none'"
            spellCheck={false}
            aria-label="Raw CSP header input"
          />
          {parsed.error && <p className="csp-tool__error" role="alert">{parsed.error.message}</p>}
          {!parsed.error && rawInput.trim() && (
            <Assessment assessment={parserAssessment} directives={parsed.directives} />
          )}
        </div>
      ) : (
        <div className="csp-tool__panel" role="tabpanel" aria-label="Generator and builder">
          <div className="csp-tool__presets" aria-label="CSP presets">
            <button type="button" onClick={() => loadPreset('strict')}>Strict CSP</button>
            <button type="button" onClick={() => loadPreset('spa')}>SPA Default</button>
            <button type="button" onClick={() => loadPreset('reportOnly')}>Report-Only Mode</button>
          </div>
          <div className="csp-tool__builder">
            {DIRECTIVES.map((directive) => {
              const sources = builderDirectives[directive] ?? [];
              const customSources = sources.filter((source) => (
                source !== "'self'" && source !== "'unsafe-inline'"
              )).join(', ');
              return (
                <fieldset className="csp-tool__directive" key={directive}>
                  <legend>{directive}</legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={Object.hasOwn(builderDirectives, directive)}
                      onChange={(event) => toggleDirective(directive, event.target.checked)}
                      aria-label={`Enable ${directive}`}
                    />
                    Enable directive
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={sources.includes("'self'")}
                      disabled={!Object.hasOwn(builderDirectives, directive)}
                      onChange={(event) => toggleCommonSource(
                        directive,
                        "'self'",
                        event.target.checked,
                      )}
                      aria-label={`Allow self for ${directive}`}
                    />
                    'self'
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={sources.includes("'unsafe-inline'")}
                      disabled={!Object.hasOwn(builderDirectives, directive)}
                      onChange={(event) => toggleCommonSource(
                        directive,
                        "'unsafe-inline'",
                        event.target.checked,
                      )}
                      aria-label={`Allow unsafe inline for ${directive}`}
                    />
                    'unsafe-inline'
                  </label>
                  <input
                    type="text"
                    value={customSources}
                    disabled={!Object.hasOwn(builderDirectives, directive)}
                    onChange={(event) => setCustomSources(directive, event.target.value)}
                    placeholder="https://cdn.example.com, 'nonce-value'"
                    aria-label={`Custom sources, hashes, or nonces for ${directive}`}
                  />
                </fieldset>
              );
            })}
            {BOOLEAN_DIRECTIVES.map((directive) => (
              <label className="csp-tool__switch" key={directive}>
                <input
                  type="checkbox"
                  checked={Object.hasOwn(builderDirectives, directive)}
                  onChange={(event) => toggleDirective(directive, event.target.checked)}
                  aria-label={`Enable ${directive}`}
                />
                {directive}
              </label>
            ))}
            <label className="csp-tool__switch">
              <input
                type="checkbox"
                checked={reportOnly}
                onChange={(event) => setReportOnly(event.target.checked)}
                aria-label="Use Content Security Policy report only header"
              />
              Generate Content-Security-Policy-Report-Only
            </label>
          </div>
          <div className="csp-tool__output-label">
            <label htmlFor="csp-generated-output">Generated CSP header</label>
            <div className="csp-tool__actions">
              <button type="button" onClick={copyHeader} aria-label="Copy generated CSP header">
                Copy to Clipboard
              </button>
              <button type="button" onClick={clearBuilder} aria-label="Clear CSP builder">
                Clear
              </button>
            </div>
          </div>
          <textarea
            id="csp-generated-output"
            className="csp-tool__textarea csp-tool__textarea--output"
            value={builderOutput}
            readOnly
            spellCheck={false}
            aria-label="Generated CSP header output"
          />
        </div>
      )}

      <p className="csp-tool__copy-status" role="status" aria-live="polite">{copyStatus}</p>
    </section>
  );
}

function Assessment({ assessment, directives }) {
  return (
    <>
      <section className={`csp-tool__assessment csp-tool__assessment--${assessment.level}`}>
        <h3>Security assessment</h3>
        <span className="csp-tool__badge">{LEVEL_TEXT[assessment.level]}</span>
        <p>{assessment.findings.length
          ? `${assessment.findings.length} local policy checks need attention.`
          : 'No configured risks were detected by the local checks.'}
        </p>
      </section>
      <div className="csp-tool__table-wrap">
        <table className="csp-tool__table" aria-label="Parsed CSP directives">
          <thead><tr><th scope="col">Directive</th><th scope="col">Sources</th></tr></thead>
          <tbody>
            {Object.entries(directives).map(([directive, sources]) => (
              <tr key={directive}>
                <td>{directive}</td><td>{sources.length ? sources.join(' ') : 'Enabled'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {assessment.findings.length > 0 && (
        <section className="csp-tool__findings" aria-label="CSP quick fix suggestions">
          <h3>Quick fixes</h3>
          <ul>
            {assessment.findings.map((finding) => (
              <li
                key={finding.id}
                className={`csp-tool__finding csp-tool__finding--${finding.level}`}
              >
                <strong>{finding.level}</strong> {finding.evidence} {finding.advisory}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
