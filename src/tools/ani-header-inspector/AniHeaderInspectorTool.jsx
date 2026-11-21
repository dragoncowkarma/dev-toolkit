import { useRef, useState } from 'react';
import { bytesFromBase64, bytesFromHex, parseAni } from './ani.utils.js';
import './ani-header-inspector.css';

const INPUT_TYPES = {
  HEX: 'hex',
  BASE64: 'base64',
};

/**
 * Renders a browser-only inspector for Windows Animated Cursor files.
 *
 * @returns {React.JSX.Element} The ANI header inspector.
 */
export default function AniHeaderInspector() {
  const [inputType, setInputType] = useState(INPUT_TYPES.HEX);
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  function inspect(bytes) {
    try {
      setResult(parseAni(bytes));
      setError('');
    } catch (parseError) {
      setResult(null);
      setError(parseError.message);
    }
  }

  function handleInspect() {
    try {
      const bytes = inputType === INPUT_TYPES.HEX ? bytesFromHex(input) : bytesFromBase64(input);
      inspect(bytes);
    } catch (parseError) {
      setResult(null);
      setError(parseError.message);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    inspect(new Uint8Array(await file.arrayBuffer()));
  }

  function handleClear() {
    setInput('');
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="ani-header-inspector" aria-label="ANI Header Inspector">
      <div className="ani-header-inspector__controls">
        <label className="ani-header-inspector__upload">
          Upload .ani file
          <input ref={fileInputRef} type="file" accept=".ani" onChange={handleFileChange} />
        </label>
        <button type="button" onClick={handleInspect}>Inspect pasted data</button>
        <button type="button" onClick={handleClear}>Clear</button>
      </div>
      <fieldset className="ani-header-inspector__input-type">
        <legend>Paste format</legend>
        <label>
          <input
            checked={inputType === INPUT_TYPES.HEX}
            name="ani-input-type"
            type="radio"
            value={INPUT_TYPES.HEX}
            onChange={() => setInputType(INPUT_TYPES.HEX)}
          />
          Hex
        </label>
        <label>
          <input
            checked={inputType === INPUT_TYPES.BASE64}
            name="ani-input-type"
            type="radio"
            value={INPUT_TYPES.BASE64}
            onChange={() => setInputType(INPUT_TYPES.BASE64)}
          />
          Base64
        </label>
      </fieldset>
      <label className="ani-header-inspector__paste" htmlFor="ani-paste-input">
        {inputType === INPUT_TYPES.HEX ? 'ANI bytes in hexadecimal' : 'ANI bytes in Base64'}
        <textarea
          id="ani-paste-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Paste ANI file bytes here"
          spellCheck={false}
        />
      </label>
      {error && <p className="ani-header-inspector__error" role="alert">{error}</p>}
      {result && <Results result={result} />}
    </section>
  );
}

function Results({ result }) {
  const { header } = result;
  return (
    <section
      className="ani-header-inspector__results"
      aria-label="ANI inspection results"
      aria-live="polite"
    >
      <h2>ANI header</h2>
      <dl>
        <Result label="RIFF size" value={`${result.riffSize} bytes`} />
        <Result label="Frames" value={header.frameCount} />
        <Result label="Steps" value={header.stepCount} />
        <Result label="Default dimensions" value={`${header.width} × ${header.height}`} />
        <Result label="Bit count" value={header.bitCount} />
        <Result label="Planes" value={header.planes} />
        <Result label="Display rate" value={`${header.displayRate} jiffies`} />
        <Result label="Flags" value={`0x${header.flags.toString(16).padStart(8, '0')}`} />
        <Result label="AF_ICON" value={header.framesAreIcons ? 'Yes (ICO/CUR frames)' : 'No'} />
      </dl>
      <h2>Embedded frames ({result.frames.length})</h2>
      <ol>
        {result.frames.map((frame, index) => (
          <li key={`${frame.offset}-${index}`}>
            Frame {index + 1}: offset {frame.offset}, {frame.length} bytes
          </li>
        ))}
      </ol>
      <OptionalValues label="Per-frame rates" values={result.rates} suffix=" jiffies" />
      <OptionalValues label="Frame sequence" values={result.sequence} suffix="" />
    </section>
  );
}

function Result({ label, value }) {
  return <><dt>{label}</dt><dd>{value}</dd></>;
}

function OptionalValues({ label, values, suffix }) {
  if (values.length === 0) return null;
  return <p><strong>{label}:</strong> {values.map((value) => `${value}${suffix}`).join(', ')}</p>;
}
