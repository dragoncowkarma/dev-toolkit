import { useEffect, useRef, useState } from 'react';
import {
  buildSriTag,
  generateSriIntegrity,
  SRI_ALGORITHMS,
  validateSriIntegrity,
} from './sriGenerator.utils.js';
import './sriGenerator.css';

const SAMPLE_CONTENT = "console.log('SRI protected asset');";
const ALL_ALGORITHMS = 'all';

/**
 * Renders local SRI integrity generation, HTML tag construction, and validation controls.
 * @returns {React.JSX.Element} The SRI Generator UI.
 */
export default function SriGeneratorTool() {
  const [content, setContent] = useState('');
  const [algorithm, setAlgorithm] = useState('sha384');
  const [target, setTarget] = useState('script');
  const [crossorigin, setCrossorigin] = useState('anonymous');
  const [url, setUrl] = useState('');
  const [expectedIntegrity, setExpectedIntegrity] = useState('');
  const [integrity, setIntegrity] = useState('');
  const [output, setOutput] = useState('');
  const [validation, setValidation] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [isComputing, setIsComputing] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = (requestRef.current += 1);
    const selectedAlgorithms = algorithm === ALL_ALGORITHMS ? SRI_ALGORITHMS : [algorithm];
    setIsComputing(true);
    setError('');
    setValidation(null);
    async function generate() {
      try {
        const nextIntegrity = await generateSriIntegrity(selectedAlgorithms, content);
        if (requestRef.current !== requestId) return;
        setIntegrity(nextIntegrity);
        setOutput(
          target === 'raw'
            ? nextIntegrity
            : buildSriTag(target, url, nextIntegrity, crossorigin)
        );
        if (expectedIntegrity.trim()) {
          setValidation(await validateSriIntegrity(content, expectedIntegrity));
        }
      } catch (reason) {
        if (requestRef.current === requestId) setError(reason.message);
      } finally {
        if (requestRef.current === requestId) setIsComputing(false);
      }
    }
    generate();
  }, [algorithm, content, crossorigin, expectedIntegrity, target, url]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 1500);
    return () => clearTimeout(timer);
  }, [notice]);

  function loadSample() {
    setContent(SAMPLE_CONTENT);
    setAlgorithm(ALL_ALGORITHMS);
    setTarget('script');
    setCrossorigin('anonymous');
    setUrl('https://cdn.example.com/assets/app.js');
    setExpectedIntegrity('');
    setNotice('Sample loaded.');
  }

  function clearTool() {
    requestRef.current += 1;
    setContent('');
    setAlgorithm('sha384');
    setTarget('script');
    setCrossorigin('anonymous');
    setUrl('');
    setExpectedIntegrity('');
    setIntegrity('');
    setOutput('');
    setValidation(null);
    setError('');
    setNotice('Cleared.');
  }

  async function copyOutput() {
    if (!output) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API is unavailable.');
      await navigator.clipboard.writeText(output);
      setNotice('Output copied to clipboard.');
    } catch {
      setNotice('Failed to copy output.');
    }
  }

  const status = error
    ? error
    : isComputing
      ? 'Generating integrity metadata…'
      : validation
        ? validation.isMatch
          ? `Integrity validation passed for ${validation.matchedAlgorithms.join(', ')}.`
          : 'Integrity validation failed. No supplied hash matches this content.'
        : 'Integrity metadata generated locally.';

  return (
    <section className="sri-generator" aria-label="SRI Generator Tool">
      <div className="sri-generator__controls">
        <label className="sri-generator__field" htmlFor="sri-content">
          Resource content
          <textarea
            id="sri-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Paste the exact script or stylesheet content…"
            spellCheck={false}
          />
        </label>

        <div className="sri-generator__selects">
          <label className="sri-generator__field" htmlFor="sri-algorithm">
            Algorithm
            <select id="sri-algorithm" value={algorithm}
              onChange={(event) => setAlgorithm(event.target.value)}>
              <option value="sha256">SHA-256</option>
              <option value="sha384">SHA-384</option>
              <option value="sha512">SHA-512</option>
              <option value={ALL_ALGORITHMS}>All algorithms</option>
            </select>
          </label>
          <label className="sri-generator__field" htmlFor="sri-target">
            Output type
            <select
              id="sri-target"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              <option value="script">Script tag</option>
              <option value="link">Link stylesheet tag</option>
              <option value="raw">Raw integrity attribute</option>
            </select>
          </label>
          <label className="sri-generator__field" htmlFor="sri-crossorigin">
            Crossorigin
            <select id="sri-crossorigin" value={crossorigin} disabled={target === 'raw'}
              onChange={(event) => setCrossorigin(event.target.value)}>
              <option value="anonymous">anonymous</option>
              <option value="use-credentials">use-credentials</option>
              <option value="">Omit attribute</option>
            </select>
          </label>
        </div>

        {target !== 'raw' && (
          <label className="sri-generator__field" htmlFor="sri-url">
            Resource URL (optional)
            <input id="sri-url" type="url" value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://cdn.example.com/assets/app.js" />
          </label>
        )}
        <label className="sri-generator__field" htmlFor="sri-expected">
          Expected integrity attribute (optional validation)
          <input id="sri-expected" value={expectedIntegrity}
            onChange={(event) => setExpectedIntegrity(event.target.value)}
            placeholder="sha384-…" spellCheck={false} />
        </label>
      </div>

      <div className="sri-generator__actions">
        <button type="button" onClick={loadSample}>Load sample</button>
        <button type="button" onClick={clearTool}>Clear</button>
        <button type="button" onClick={copyOutput} disabled={!output}>Copy output</button>
      </div>

      <div className="sri-generator__output">
        <div className="sri-generator__output-heading">
          <span>Generated output</span>
          <span>{integrity ? `${integrity.split(' ').length} hash value(s)` : ''}</span>
        </div>
        <output aria-label="Generated SRI output">{output || '—'}</output>
      </div>
      <p className="sri-generator__status" aria-live="polite">{notice || status}</p>
    </section>
  );
}
