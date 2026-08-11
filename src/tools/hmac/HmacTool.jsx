import { useEffect, useRef, useState } from 'react';
import {
  computeHmac,
  HMAC_ALGORITHMS,
  INPUT_ENCODINGS,
  OUTPUT_ENCODINGS,
  verifyHmac,
} from './hmac.utils.js';
import './hmac.css';

const MODES = { GENERATE: 'generate', VERIFY: 'verify' };

/**
 * Renders real-time HMAC generation and verification controls.
 * @returns {React.JSX.Element} The HMAC tool UI.
 */
export default function HmacTool() {
  const [mode, setMode] = useState(MODES.GENERATE);
  const [algorithm, setAlgorithm] = useState('SHA-256');
  const [key, setKey] = useState('');
  const [keyEncoding, setKeyEncoding] = useState('UTF-8');
  const [message, setMessage] = useState('');
  const [messageEncoding, setMessageEncoding] = useState('UTF-8');
  const [outputEncoding, setOutputEncoding] = useState('Hex');
  const [signature, setSignature] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const [verification, setVerification] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState('');
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = (requestRef.current += 1);
    setSignature('');
    setError('');
    setVerification(null);
    if (!key || !message) return;

    const execute = mode === MODES.GENERATE
      ? computeHmac(algorithm, key, keyEncoding, message, messageEncoding, outputEncoding)
      : verifyHmac(algorithm, key, keyEncoding, message, messageEncoding, target, outputEncoding);
    execute.then((result) => {
      if (requestRef.current !== requestId) return;
      if (mode === MODES.GENERATE) setSignature(result);
      else setVerification(result);
    }).catch((reason) => {
      if (requestRef.current === requestId) setError(reason.message);
    });
  }, [algorithm, key, keyEncoding, message, messageEncoding, mode, outputEncoding, target]);

  useEffect(() => {
    if (!copyFeedback) return undefined;
    const timer = setTimeout(() => setCopyFeedback(''), 1500);
    return () => clearTimeout(timer);
  }, [copyFeedback]);

  async function copySignature() {
    if (!signature) return;
    try {
      await navigator.clipboard.writeText(signature);
      setCopyFeedback('Signature copied to clipboard.');
    } catch {
      setCopyFeedback('Failed to copy signature.');
    }
  }

  return (
    <section className="hmac-tool" aria-label="HMAC Generator Tool">
      <div className="hmac-tabs" role="group" aria-label="HMAC mode">
        <button type="button" aria-pressed={mode === MODES.GENERATE}
          className={mode === MODES.GENERATE ? 'active' : ''}
          onClick={() => setMode(MODES.GENERATE)}>Generate HMAC</button>
        <button type="button" aria-pressed={mode === MODES.VERIFY}
          className={mode === MODES.VERIFY ? 'active' : ''}
          onClick={() => setMode(MODES.VERIFY)}>Verify HMAC</button>
      </div>

      <div className="hmac-controls">
        <label>Algorithm
          <select aria-label="HMAC algorithm" value={algorithm}
            onChange={(event) => setAlgorithm(event.target.value)}>
            {HMAC_ALGORITHMS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>Output format
          <select aria-label="HMAC output format" value={outputEncoding}
            onChange={(event) => setOutputEncoding(event.target.value)}>
            {OUTPUT_ENCODINGS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <div className="hmac-fields">
        <label htmlFor="hmac-key">Secret key
          <select aria-label="Secret key encoding" value={keyEncoding}
            onChange={(event) => setKeyEncoding(event.target.value)}>
            {INPUT_ENCODINGS.map((item) => <option key={item}>{item}</option>)}
          </select>
          <input id="hmac-key" aria-label="Secret key" value={key}
            onChange={(event) => setKey(event.target.value)} placeholder="Enter a secret key" />
        </label>
        <label htmlFor="hmac-message">Message
          <select aria-label="Message encoding" value={messageEncoding}
            onChange={(event) => setMessageEncoding(event.target.value)}>
            {INPUT_ENCODINGS.map((item) => <option key={item}>{item}</option>)}
          </select>
          <textarea id="hmac-message" aria-label="Message" value={message}
            onChange={(event) => setMessage(event.target.value)} placeholder="Enter a message" />
        </label>
      </div>

      {mode === MODES.GENERATE ? (
        <div className="hmac-output">
          <div className="hmac-output__header"><span>HMAC signature</span>
            <button type="button" onClick={copySignature} disabled={!signature}
              aria-label="Copy HMAC signature">Copy</button>
          </div>
          <output aria-label="HMAC signature">{signature || '—'}</output>
        </div>
      ) : (
        <div className="hmac-verification">
          <label htmlFor="hmac-target">Target signature
            <textarea id="hmac-target" aria-label="Target HMAC signature" value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder={`Paste ${outputEncoding} signature to verify`} />
          </label>
          <div role="status" className={`hmac-status hmac-status--${verification}`}>
            {!key || !message || !target ? 'Enter a key, message, and target signature.'
              : verification === null ? 'Verifying signature…'
                : verification ? 'Valid signature match.' : 'Invalid signature match.'}
          </div>
        </div>
      )}
      <p className="hmac-feedback" aria-live="polite">{copyFeedback}</p>
      {error && <p className="hmac-error" role="alert">{error}</p>}
    </section>
  );
}
