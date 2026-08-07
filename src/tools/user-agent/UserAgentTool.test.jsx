import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UserAgentTool from './UserAgentTool.jsx';

const CHROME_WINDOWS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ',
  '(KHTML, like Gecko) Chrome/124.0.6367.207 Safari/537.36',
].join('');
const FIREFOX_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0';

function getCard(label) {
  return screen.getByRole('article', { name: label });
}

let restoreNavigatorUserAgent = null;

function setNavigatorUserAgent(value) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value,
  });

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(navigator, 'userAgent', originalDescriptor);
      return;
    }
    Reflect.deleteProperty(navigator, 'userAgent');
  };
}

afterEach(() => {
  cleanup();
  restoreNavigatorUserAgent?.();
  restoreNavigatorUserAgent = null;
  vi.restoreAllMocks();
});

describe('UserAgentTool', () => {
  it('renders accessible input controls and unknown fallback cards', () => {
    render(<UserAgentTool />);

    expect(screen.getByLabelText('Preset User-Agent')).toBeInTheDocument();
    expect(screen.getByLabelText('Paste a User-Agent string')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Detect My Browser' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    expect(within(getCard('Browser')).getByText('Unknown')).toBeInTheDocument();
  });

  it('updates the structured breakdown as a User-Agent string is typed', () => {
    render(<UserAgentTool />);

    fireEvent.change(screen.getByLabelText('Paste a User-Agent string'), {
      target: { value: CHROME_WINDOWS },
    });

    expect(within(getCard('Browser')).getByText('Chrome')).toBeInTheDocument();
    expect(within(getCard('Operating System')).getByText('Windows')).toBeInTheDocument();
    expect(within(getCard('Device')).getByText('Desktop')).toBeInTheDocument();
    expect(within(getCard('Rendering Engine')).getByText('Blink')).toBeInTheDocument();
    expect(within(getCard('CPU Architecture')).getByText('x86_64')).toBeInTheDocument();
  });

  it('loads a selected preset into the input and parses its crawler details', () => {
    render(<UserAgentTool />);

    fireEvent.change(screen.getByLabelText('Preset User-Agent'), {
      target: { value: 'googlebot' },
    });

    expect(screen.getByLabelText('Paste a User-Agent string').value).toContain('Googlebot/2.1');
    expect(within(getCard('Browser')).getByText('Googlebot')).toBeInTheDocument();
    expect(within(getCard('Device')).getByText('Bot/Crawler')).toBeInTheDocument();
  });

  it('fills the input with the current browser User-Agent on request', () => {
    restoreNavigatorUserAgent = setNavigatorUserAgent(FIREFOX_LINUX);
    render(<UserAgentTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Detect My Browser' }));

    expect(screen.getByLabelText('Paste a User-Agent string')).toHaveValue(FIREFOX_LINUX);
    expect(within(getCard('Browser')).getByText('Firefox')).toBeInTheDocument();
  });

  it('copies the entered User-Agent and clears input state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<UserAgentTool />);

    fireEvent.change(screen.getByLabelText('Paste a User-Agent string'), {
      target: { value: CHROME_WINDOWS },
    });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy User-Agent' })));

    expect(writeText).toHaveBeenCalledWith(CHROME_WINDOWS);
    expect(screen.getByRole('status')).toHaveTextContent('User-Agent copied to clipboard.');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('Paste a User-Agent string')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    expect(within(getCard('Browser')).getByText('Unknown')).toBeInTheDocument();
  });
});
