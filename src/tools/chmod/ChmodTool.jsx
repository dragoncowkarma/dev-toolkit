import { useEffect, useState } from 'react';
import {
  formatChmodCommand,
  formatOctal,
  formatSymbolic,
  matrixToMode,
  modeToMatrix,
  parseOctal,
  parseSymbolic,
} from './chmodUtils.js';
import './chmod.css';

const DEFAULT_MODE = 0o755;
const PRESETS = [
  { label: '755 Exec', mode: 0o755 },
  { label: '644 File', mode: 0o644 },
  { label: '700 Private', mode: 0o700 },
  { label: '400 Read Only', mode: 0o400 },
];
const PERMISSION_ROWS = [
  ['owner', 'Owner (User)'],
  ['group', 'Group'],
  ['others', 'Others'],
];
const PERMISSIONS = [
  ['read', 'Read', 'r = 4'],
  ['write', 'Write', 'w = 2'],
  ['execute', 'Execute', 'x = 1'],
];
const SPECIALS = [
  ['setuid', 'SetUID', '4'],
  ['setgid', 'SetGID', '2'],
  ['sticky', 'Sticky Bit', '1'],
];

/**
 * Renders an accessible Unix chmod calculator with synchronized inputs.
 * @returns {React.JSX.Element} The chmod calculator UI.
 */
export default function ChmodTool() {
  const [mode, setMode] = useState(DEFAULT_MODE);
  const [octalInput, setOctalInput] = useState(formatOctal(DEFAULT_MODE));
  const [symbolicInput, setSymbolicInput] = useState(formatSymbolic(DEFAULT_MODE));
  const [filename, setFilename] = useState('filename');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const matrix = modeToMatrix(mode);
  const chmodCommand = formatChmodCommand(mode, filename);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 1500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function applyMode(nextMode) {
    setMode(nextMode);
    setOctalInput(formatOctal(nextMode));
    setSymbolicInput(formatSymbolic(nextMode));
    setError('');
  }

  function handleMatrixChange(permissionClass, permission, checked) {
    const nextMatrix = structuredClone(matrix);
    if (permissionClass === 'special') nextMatrix.special[permission] = checked;
    else nextMatrix.permissions[permissionClass][permission] = checked;
    applyMode(matrixToMode(nextMatrix));
  }

  function handleOctalChange(event) {
    const value = event.target.value;
    setOctalInput(value);
    const parsed = parseOctal(value);
    if (parsed === null) {
      setError(value ? 'Enter a valid three- or four-digit octal value.' : '');
      return;
    }
    setMode(parsed);
    setSymbolicInput(formatSymbolic(parsed));
    setError('');
  }

  function handleSymbolicChange(event) {
    const value = event.target.value;
    setSymbolicInput(value);
    const parsed = parseSymbolic(value);
    if (parsed === null) {
      setError(value ? 'Enter a symbolic value such as -rwxr-xr-x.' : '');
      return;
    }
    setMode(parsed);
    setOctalInput(formatOctal(parsed));
    setError('');
  }

  async function copyValue(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setToast(`${label} copied to clipboard.`);
    } catch {
      setError('Clipboard access was unavailable.');
    }
  }

  return (
    <section
      className="chmod-tool"
      aria-label="Unix file permissions calculator"
    >
      <div className="chmod-tool__overview">
        <div>
          <span>Octal</span>
          <strong>{formatOctal(mode)}</strong>
        </div>
        <div>
          <span>Symbolic</span>
          <code>{formatSymbolic(mode)}</code>
        </div>
        <div>
          <span>Command</span>
          <code>{chmodCommand}</code>
        </div>
      </div>

      <div
        className="chmod-tool__presets"
        role="group"
        aria-label="Permission presets"
      >
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyMode(preset.mode)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div
        className="chmod-tool__matrix"
        role="group"
        aria-label="Permission matrix"
      >
        <div className="chmod-tool__matrix-head">
          <span>Class</span>
          {PERMISSIONS.map(([, label, value]) => (
            <span key={label}>
              {label}
              <small>{value}</small>
            </span>
          ))}
        </div>
        {PERMISSION_ROWS.map(([permissionClass, label]) => (
          <fieldset className="chmod-tool__matrix-row" key={permissionClass}>
            <legend>{label}</legend>
            {PERMISSIONS.map(([permission, labelText]) => (
              <label key={permission}>
                <input
                  type="checkbox"
                  checked={matrix.permissions[permissionClass][permission]}
                  onChange={(event) => handleMatrixChange(
                    permissionClass,
                    permission,
                    event.target.checked,
                  )}
                  aria-label={`${label} ${labelText}`}
                />
                <span>{labelText}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      <fieldset className="chmod-tool__special" aria-label="Special bits">
        <legend>Special Bits</legend>
        {SPECIALS.map(([special, label, value]) => (
          <label key={special}>
            <input
              type="checkbox"
              checked={matrix.special[special]}
              onChange={(event) => handleMatrixChange(
                'special',
                special,
                event.target.checked,
              )}
              aria-label={label}
            />
            {label} <small>({value})</small>
          </label>
        ))}
      </fieldset>

      <div className="chmod-tool__inputs">
        <label>
          Octal permission
          <input
            value={octalInput}
            onChange={handleOctalChange}
            aria-label="Octal permission"
            inputMode="numeric"
          />
        </label>
        <label>
          Symbolic permission
          <input
            value={symbolicInput}
            onChange={handleSymbolicChange}
            aria-label="Symbolic permission"
          />
        </label>
        <label>
          Filename
          <input
            value={filename}
            onChange={(event) => setFilename(event.target.value)}
            aria-label="Filename"
          />
        </label>
      </div>

      <div
        className="chmod-tool__copies"
        role="group"
        aria-label="Copy permission values"
      >
        <button
          type="button"
          onClick={() => copyValue(formatOctal(mode), 'Octal value')}
        >
          Copy octal
        </button>
        <button
          type="button"
          onClick={() => copyValue(formatSymbolic(mode), 'Symbolic value')}
        >
          Copy symbolic
        </button>
        <button
          type="button"
          onClick={() => copyValue(chmodCommand, 'chmod command')}
        >
          Copy command
        </button>
        <button
          type="button"
          onClick={() => copyValue(
            `${formatOctal(mode)}\n${formatSymbolic(mode)}\n${chmodCommand}`,
            'All values',
          )}
        >
          Copy all
        </button>
      </div>
      <p className="chmod-tool__status" role="status" aria-live="polite">
        {toast}
      </p>
      {error && (
        <p className="chmod-tool__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
