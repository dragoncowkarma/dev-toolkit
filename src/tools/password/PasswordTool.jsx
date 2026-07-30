import { useMemo, useState } from 'react';
import {
  CHARACTER_SETS,
  DEFAULT_BATCH_SIZE,
  DEFAULT_OPTIONS,
  DEFAULT_PASSWORD_LENGTH,
  MAX_BATCH_SIZE,
  MAX_PASSWORD_LENGTH,
  MIN_BATCH_SIZE,
  MIN_PASSWORD_LENGTH,
  calculateEntropy,
  generatePasswordBatch,
  getCharacterPool,
  getPasswordStrength,
} from './password.utils.js';
import './password.css';

const CHARACTER_OPTIONS = [
  ['lowercase', 'Lowercase', 'a-z'],
  ['uppercase', 'Uppercase', 'A-Z'],
  ['numbers', 'Numbers', '0-9'],
  ['symbols', 'Symbols', '!@#$'],
];

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Renders a customizable, cryptographically secure password generator.
 *
 * @param {object} props Component props.
 * @param {() => void} [props.onBack] Returns to the default tool.
 * @returns {React.JSX.Element} The password generator UI.
 */
export default function PasswordTool({ onBack }) {
  const [length, setLength] = useState(DEFAULT_PASSWORD_LENGTH);
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [passwords, setPasswords] = useState(() =>
    generatePasswordBatch({ length: DEFAULT_PASSWORD_LENGTH, options: DEFAULT_OPTIONS })
  );
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  const characterPool = useMemo(() => getCharacterPool(options), [options]);
  const entropy = calculateEntropy(length, characterPool.length);
  const strength = getPasswordStrength(entropy);

  function setBoundedValue(setter, minimum, maximum, value) {
    const parsedValue = Number.parseInt(value, 10);
    if (!Number.isNaN(parsedValue)) setter(clamp(parsedValue, minimum, maximum));
  }

  function toggleOption(name) {
    const nextOptions = { ...options, [name]: !options[name] };
    setOptions(nextOptions);
    if (!getCharacterPool(nextOptions)) {
      setError('Select at least one character set before generating a password.');
    } else {
      setError('');
    }
  }

  function regenerate() {
    if (!characterPool) {
      setError('Select at least one character set before generating a password.');
      return;
    }

    setPasswords(generatePasswordBatch({ length, batchSize, options }));
    setError('');
    setCopyStatus('');
  }

  async function copyPassword(password, index) {
    try {
      await navigator.clipboard.writeText(password);
      setCopyStatus(`Password ${index + 1} copied to clipboard.`);
    } catch {
      setCopyStatus(`Password ${index + 1} could not be copied to the clipboard.`);
    }
  }

  return (
    <section className="password-tool" aria-label="Password Generator Tool">
      {onBack && (
        <div className="password-tool__header-row">
          <button type="button" className="password-tool__button" onClick={onBack}>
            <span aria-hidden="true">←</span> Back
          </button>
        </div>
      )}

      <div className="password-tool__settings">
        <fieldset className="password-tool__panel">
          <legend>Password length</legend>
          <div className="password-tool__length-control">
            <input
              id="password-length-range"
              type="range"
              min={MIN_PASSWORD_LENGTH}
              max={MAX_PASSWORD_LENGTH}
              value={length}
              onChange={(event) =>
                setBoundedValue(
                  setLength,
                  MIN_PASSWORD_LENGTH,
                  MAX_PASSWORD_LENGTH,
                  event.target.value
                )
              }
              aria-label="Password length slider"
            />
            <input
              id="password-length"
              type="number"
              min={MIN_PASSWORD_LENGTH}
              max={MAX_PASSWORD_LENGTH}
              value={length}
              onChange={(event) =>
                setBoundedValue(
                  setLength,
                  MIN_PASSWORD_LENGTH,
                  MAX_PASSWORD_LENGTH,
                  event.target.value
                )
              }
              aria-label="Password length"
            />
          </div>
          <p>Choose between {MIN_PASSWORD_LENGTH} and {MAX_PASSWORD_LENGTH} characters.</p>
        </fieldset>

        <fieldset className="password-tool__panel">
          <legend>Characters</legend>
          <div className="password-tool__options">
            {CHARACTER_OPTIONS.map(([name, label, hint]) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={options[name]}
                  onChange={() => toggleOption(name)}
                />
                <span>{label}</span><small>{hint}</small>
              </label>
            ))}
            <label className="password-tool__ambiguous-option">
              <input
                type="checkbox"
                checked={options.excludeAmbiguous}
                onChange={() => toggleOption('excludeAmbiguous')}
              />
              <span>Exclude ambiguous</span><small>0 O 1 l I</small>
            </label>
          </div>
        </fieldset>

        <fieldset className="password-tool__panel">
          <legend>Batch size</legend>
          <input
            id="password-batch-size"
            type="number"
            min={MIN_BATCH_SIZE}
            max={MAX_BATCH_SIZE}
            value={batchSize}
            onChange={(event) =>
              setBoundedValue(setBatchSize, MIN_BATCH_SIZE, MAX_BATCH_SIZE, event.target.value)
            }
          />
          <p>Generate {MIN_BATCH_SIZE} to {MAX_BATCH_SIZE} passwords at once.</p>
        </fieldset>
      </div>

      <div className="password-tool__summary">
        <div>
          <span
            className={`password-tool__strength password-tool__strength--${strength
              .toLowerCase()
              .replace(' ', '-')}`}
          >
            {strength}
          </span>
          <strong>{entropy.toFixed(1)} bits of entropy</strong>
          <small>{characterPool.length} possible characters per position</small>
        </div>
        <button
          type="button"
          className="password-tool__button password-tool__button--primary"
          onClick={regenerate}
        >
          ↻ Regenerate
        </button>
      </div>

      {error && <div className="password-tool__error" role="alert">⚠ {error}</div>}

      <ol className="password-tool__results" aria-label="Generated passwords">
        {passwords.map((password, index) => (
          <li key={`${password}-${index}`}>
            <code>{password}</code>
            <button
              type="button"
              onClick={() => copyPassword(password, index)}
              aria-label={`Copy password ${index + 1}`}
            >
              Copy
            </button>
          </li>
        ))}
      </ol>

      <p className="password-tool__copy-status" role="status" aria-live="polite">{copyStatus}</p>
    </section>
  );
}
