import { useEffect, useMemo, useRef, useState } from 'react';
import {
  base32Decode,
  buildOtpAuthUri,
  counterForTime,
  generateRandomSecret,
  hotp,
  parseOtpAuthUri,
  secondsRemaining,
  totp,
} from './totp.utils.js';
import './totp.css';

const ALGORITHMS = ['SHA-1', 'SHA-256', 'SHA-512'];
const DIGITS = [6, 7, 8];

function numericSetting(value, name) {
  if (!/^\d+$/.test(value)) return { value: null, error: `${name} must be a whole number.` };
  const number = Number(value);
  if (!Number.isSafeInteger(number)) return { value: null, error: `${name} is too large.` };
  return { value: number, error: '' };
}

/**
 * Renders a local TOTP/HOTP generator and otpauth Key URI inspector.
 * @returns {React.JSX.Element} The TOTP generator UI.
 */
export default function TotpTool() {
  const [mode, setMode] = useState('totp');
  const [secret, setSecret] = useState('');
  const [uri, setUri] = useState('');
  const [label, setLabel] = useState('');
  const [issuer, setIssuer] = useState('');
  const [algorithm, setAlgorithm] = useState('SHA-1');
  const [digits, setDigits] = useState('6');
  const [period, setPeriod] = useState('30');
  const [counter, setCounter] = useState('0');
  const [code, setCode] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [uriError, setUriError] = useState('');
  const [calculationError, setCalculationError] = useState('');
  const [status, setStatus] = useState('');
  const latestRequest = useRef(0);
  const previousCounter = useRef(null);

  const decodedSecret = useMemo(() => base32Decode(secret), [secret]);
  const parsedDigits = useMemo(() => numericSetting(digits, 'Digits'), [digits]);
  const parsedPeriod = useMemo(() => numericSetting(period, 'Period'), [period]);
  const parsedCounter = useMemo(() => numericSetting(counter, 'Counter'), [counter]);
  const validationError = useMemo(() => {
    if (secret && decodedSecret.error) return decodedSecret.error;
    if (parsedDigits.value !== null && (parsedDigits.value < 6 || parsedDigits.value > 8)) {
      return 'Digits must be between 6 and 8.';
    }
    if (parsedDigits.error) return parsedDigits.error;
    if (parsedPeriod.value === null || parsedPeriod.value <= 0) {
      return parsedPeriod.error || 'Period must be a positive whole number.';
    }
    if (mode === 'hotp' && (parsedCounter.value === null || parsedCounter.value < 0)) {
      return parsedCounter.error || 'Counter must be a non-negative whole number.';
    }
    return '';
  }, [decodedSecret.error, mode, parsedCounter, parsedDigits, parsedPeriod, secret]);

  const builtUri = useMemo(() => {
    if (!secret || validationError) return '';
    try {
      return buildOtpAuthUri({
        type: mode,
        label,
        issuer,
        secret,
        algorithm,
        digits: parsedDigits.value,
        period: parsedPeriod.value,
        counter: parsedCounter.value,
      });
    } catch {
      return '';
    }
  }, [algorithm, issuer, label, mode, parsedCounter.value, parsedDigits.value, parsedPeriod.value,
    secret, validationError]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (mode !== 'totp' || !secret || validationError) {
      if (mode === 'totp') setCode('');
      return undefined;
    }
    const requestId = (latestRequest.current += 1);
    const timeCounter = counterForTime(now, parsedPeriod.value);
    totp(decodedSecret.bytes, {
      algorithm,
      digits: parsedDigits.value,
      period: parsedPeriod.value,
      timestampMs: now,
    }).then((nextCode) => {
      if (requestId !== latestRequest.current) return;
      setCode(nextCode);
      setCalculationError('');
      if (previousCounter.current !== null && previousCounter.current !== timeCounter) {
        setStatus('Code refreshed for the new time window.');
      }
      previousCounter.current = timeCounter;
    }).catch((reason) => {
      if (requestId === latestRequest.current) setCalculationError(reason.message);
    });
    return undefined;
  }, [algorithm, decodedSecret.bytes, mode, now, parsedDigits.value, parsedPeriod.value, secret,
    validationError]);

  useEffect(() => {
    if (!status) return undefined;
    const timer = setTimeout(() => setStatus(''), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  function handleUriChange(value) {
    setUri(value);
    if (!value.trim()) {
      setUriError('');
      return;
    }
    const result = parseOtpAuthUri(value);
    if (result.error) {
      setUriError(result.error);
      return;
    }
    setUriError('');
    setMode(result.type);
    setSecret(result.secret);
    setLabel(result.label);
    setIssuer(result.issuer);
    setAlgorithm(result.algorithm);
    setDigits(String(result.digits));
    setPeriod(String(result.period));
    if (result.type === 'hotp') setCounter(String(result.counter));
    setStatus('Provisioning URI loaded into the generator.');
  }

  function handleRandomSecret() {
    try {
      setSecret(generateRandomSecret());
      setCalculationError('');
      setStatus('Generated a new random test secret.');
    } catch (reason) {
      setCalculationError(reason.message);
    }
  }

  async function nextHotpCode() {
    if (validationError || !secret || mode !== 'hotp') return;
    const requestId = (latestRequest.current += 1);
    try {
      const nextCode = await hotp(decodedSecret.bytes, parsedCounter.value, {
        algorithm,
        digits: parsedDigits.value,
      });
      if (requestId !== latestRequest.current) return;
      setCode(nextCode);
      setCounter(String(parsedCounter.value + 1));
      setCalculationError('');
      setStatus(`Generated code for counter ${parsedCounter.value}. Counter advanced.`);
    } catch (reason) {
      if (requestId === latestRequest.current) setCalculationError(reason.message);
    }
  }

  async function copyText(text, message) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus(message);
    } catch {
      setStatus('Clipboard access was unavailable.');
    }
  }

  const error = uriError || validationError || calculationError;
  const remaining = parsedPeriod.value && parsedPeriod.value > 0
    ? secondsRemaining(now, parsedPeriod.value) : null;

  return (
    <section className="totp-tool" aria-label="TOTP Generator Tool">
      <div className="totp-tool__intro">
        <p className="totp-tool__eyebrow">LOCAL 2FA VERIFICATION</p>
        <h2>Time-based one-time passcode generator</h2>
        <p>
          Generates codes only from a secret you already possess for your own account or test
          fixture. It never makes network requests or persists secrets; this is a local testing aid,
          to intercept or bypass anyone else’s 2FA.
        </p>
      </div>

      <div
        className="totp-tool__mode"
        role="group"
        aria-label="One-time passcode mode"
      >
        <button
          type="button"
          className={
            mode === 'totp' ? 'totp-tool__mode-button is-active' : 'totp-tool__mode-button'
          }
          aria-pressed={mode === 'totp'}
          onClick={() => setMode('totp')}
        >
          TOTP (time-based)
        </button>
        <button
          type="button"
          className={
            mode === 'hotp' ? 'totp-tool__mode-button is-active' : 'totp-tool__mode-button'
          }
          aria-pressed={mode === 'hotp'}
          onClick={() => setMode('hotp')}
        >
          HOTP (counter-based)
        </button>
      </div>

      <div className="totp-tool__panel totp-tool__uri-panel">
        <label htmlFor="totp-uri">otpauth:// provisioning URI inspector</label>
        <textarea
          id="totp-uri"
          value={uri}
          onChange={(event) => handleUriChange(event.target.value)}
          placeholder="otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP"
          spellCheck={false}
        />
      </div>

      <div className="totp-tool__grid">
        <div className="totp-tool__panel">
          <div className="totp-tool__label-row">
            <label htmlFor="totp-secret">Base32 secret</label>
            <button type="button" onClick={handleRandomSecret}>
              Generate random secret
            </button>
          </div>
          <input
            id="totp-secret"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="JBSWY3DPEHPK3PXP"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="totp-tool__panel">
          <label htmlFor="totp-label">Account label</label>
          <input id="totp-label" value={label} onChange={(event) => setLabel(event.target.value)} />
        </div>
        <div className="totp-tool__panel">
          <label htmlFor="totp-issuer">Issuer</label>
          <input
            id="totp-issuer"
            value={issuer}
            onChange={(event) => setIssuer(event.target.value)}
          />
        </div>
        <div className="totp-tool__panel">
          <label htmlFor="totp-algorithm">Algorithm</label>
          <select
            id="totp-algorithm"
            value={algorithm}
            onChange={(event) => setAlgorithm(event.target.value)}
          >
            {ALGORITHMS.map((item) => <option key={item}>{item}</option>)}
          </select>
          <small>SHA-1 is the default because virtually all authenticator apps expect it.</small>
        </div>
        <div className="totp-tool__panel">
          <label htmlFor="totp-digits">Code digits</label>
          <select
            id="totp-digits"
            value={digits}
            onChange={(event) => setDigits(event.target.value)}
          >
            {DIGITS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div className="totp-tool__panel">
          <label htmlFor="totp-period">Period (seconds)</label>
          <input
            id="totp-period"
            type="number"
            min="1"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          />
        </div>
        {mode === 'hotp' && (
          <div className="totp-tool__panel">
            <label htmlFor="totp-counter">Counter</label>
            <input
              id="totp-counter"
              type="number"
              min="0"
              value={counter}
              onChange={(event) => setCounter(event.target.value)}
            />
          </div>
        )}
      </div>

      {error && <p className="totp-tool__error" role="alert">{error}</p>}

      <div className="totp-tool__result" aria-label="One-time passcode result">
        <div>
          <span>Current one-time code</span>
          <output role="presentation" aria-label="Current one-time code">{code || '—'}</output>
          {mode === 'totp' && <small>{remaining ?? '—'} seconds remaining</small>}
        </div>
        <div className="totp-tool__result-actions">
          {mode === 'hotp' && (
            <button
              type="button"
              onClick={nextHotpCode}
              disabled={!secret || Boolean(validationError)}
            >
              Next code
            </button>
          )}
          <button
            type="button"
            onClick={() => copyText(code, 'One-time code copied to clipboard.')}
            disabled={!code}
          >
            Copy code
          </button>
        </div>
      </div>

      <div className="totp-tool__panel totp-tool__built-uri">
        <div className="totp-tool__label-row">
          <label htmlFor="totp-built-uri">Built otpauth:// URI</label>
          <button
            type="button"
            onClick={() => copyText(builtUri, 'Provisioning URI copied to clipboard.')}
            disabled={!builtUri}
          >
            Copy URI
          </button>
        </div>
        <input id="totp-built-uri" value={builtUri} readOnly aria-label="Built otpauth URI" />
        <small>
          Paste this URI into the existing QR Code Generator tool if you need a scannable image.
        </small>
      </div>

      <p className="totp-tool__status" role="status" aria-live="polite">{status}</p>
    </section>
  );
}
