import { useEffect, useMemo, useState } from 'react';
import {
  getCurrentUserAgent,
  parseUserAgent,
  UNKNOWN_VALUE,
  USER_AGENT_PRESETS,
} from './userAgent.utils.js';
import './userAgent.css';

const DETAIL_CARDS = [
  { id: 'browser', label: 'Browser', icon: '◉' },
  { id: 'os', label: 'Operating System', icon: '⌘' },
  { id: 'device', label: 'Device', icon: '▣' },
  { id: 'engine', label: 'Rendering Engine', icon: '⚙' },
  { id: 'cpu', label: 'CPU Architecture', icon: '⌁' },
];

function getCardValue(id, details) {
  if (id === 'device') return details.device.type;
  if (id === 'cpu') return details.cpu.architecture;
  return details[id].name;
}

function getCardDescription(id, details) {
  if (id === 'device') {
    const device = details.device;
    const clues = [device.vendor, device.model].filter((value) => value !== UNKNOWN_VALUE);
    return clues.length > 0 ? clues.join(' · ') : 'Category detected from the User-Agent';
  }
  if (id === 'cpu') return 'Architecture reported by the User-Agent';

  const version = details[id].version;
  return version === UNKNOWN_VALUE ? 'Version unavailable' : `Version ${version}`;
}

/**
 * Renders a client-side User-Agent parser with presets and structured browser details.
 *
 * @returns {React.JSX.Element} The User Agent Parser tool UI.
 */
export default function UserAgentTool() {
  const [userAgent, setUserAgent] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const details = useMemo(() => parseUserAgent(userAgent), [userAgent]);
  const isCopyError = copyMessage.startsWith('Failed');

  useEffect(() => {
    if (!copyMessage) return undefined;
    const timer = setTimeout(() => setCopyMessage(''), 1500);
    return () => clearTimeout(timer);
  }, [copyMessage]);

  function handleUserAgentChange(event) {
    setUserAgent(event.target.value);
    setSelectedPreset('');
    setCopyMessage('');
  }

  function handlePresetChange(event) {
    const presetId = event.target.value;
    const preset = USER_AGENT_PRESETS.find((item) => item.id === presetId);
    setSelectedPreset(presetId);
    setUserAgent(preset?.userAgent ?? '');
    setCopyMessage('');
  }

  function handleDetectMyBrowser() {
    setUserAgent(getCurrentUserAgent());
    setSelectedPreset('');
    setCopyMessage('');
  }

  async function handleCopy() {
    if (!userAgent) return;
    try {
      await navigator.clipboard.writeText(userAgent);
      setCopyMessage('User-Agent copied to clipboard.');
    } catch {
      setCopyMessage('Failed to copy User-Agent to clipboard.');
    }
  }

  function handleClear() {
    setUserAgent('');
    setSelectedPreset('');
    setCopyMessage('');
  }

  return (
    <section className="user-agent" aria-label="User Agent Parser Tool">
      <header className="user-agent__intro">
        <p className="user-agent__eyebrow">CLIENT INSPECTION</p>
        <h2>Parse a User-Agent string</h2>
        <p>Inspect browser, operating system, device, rendering engine, and CPU signals locally.</p>
      </header>

      <section className="user-agent__input-panel" aria-labelledby="user-agent-input-title">
        <div className="user-agent__section-heading">
          <div>
            <p className="user-agent__eyebrow">INPUT</p>
            <h3 id="user-agent-input-title">User-Agent string</h3>
          </div>
          <div className="user-agent__actions">
            <button
              className="user-agent__primary-action"
              type="button"
              onClick={handleDetectMyBrowser}
            >
              Detect My Browser
            </button>
            <button type="button" onClick={handleCopy} disabled={!userAgent}>
              Copy User-Agent
            </button>
            <button type="button" onClick={handleClear} disabled={!userAgent}>
              Clear
            </button>
          </div>
        </div>

        <label className="user-agent__preset-label" htmlFor="user-agent-preset">
          Preset User-Agent
          <select id="user-agent-preset" value={selectedPreset} onChange={handlePresetChange}>
            <option value="">Choose a common browser, device, or crawler…</option>
            {USER_AGENT_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>

        <label className="user-agent__textarea-label" htmlFor="user-agent-input">
          Paste a User-Agent string
          <textarea
            id="user-agent-input"
            value={userAgent}
            onChange={handleUserAgentChange}
            placeholder="Mozilla/5.0 (…)"
            spellCheck={false}
            rows="6"
          />
        </label>
      </section>

      {copyMessage && (
        <p
          className={isCopyError ? 'user-agent__message is-error' : 'user-agent__message'}
          role={isCopyError ? 'alert' : 'status'}
          aria-live={isCopyError ? 'assertive' : 'polite'}
        >
          {copyMessage}
        </p>
      )}

      <section className="user-agent__results" aria-label="Parsed User-Agent details">
        <div className="user-agent__section-heading">
          <div>
            <p className="user-agent__eyebrow">BREAKDOWN</p>
            <h3>Detected details</h3>
          </div>
          <span>Updates as you type</span>
        </div>

        <div className="user-agent__cards" aria-live="polite">
          {DETAIL_CARDS.map((card) => (
            <article
              className="user-agent__card"
              key={card.id}
              aria-labelledby={`user-agent-${card.id}-title`}
            >
              <span className="user-agent__card-icon" aria-hidden="true">
                {card.icon}
              </span>
              <div>
                <h4 id={`user-agent-${card.id}-title`}>{card.label}</h4>
                <p className="user-agent__card-value">{getCardValue(card.id, details)}</p>
                <p className="user-agent__card-description">
                  {getCardDescription(card.id, details)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
