import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TotpTool from './TotpTool.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function enterSecret(value = 'JBSWY3DP') {
  fireEvent.change(screen.getByLabelText('Base32 secret'), { target: { value } });
}

describe('TotpTool', () => {
  it('shows a live TOTP code and countdown rollover at a period boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(29_999));
    render(<TotpTool />);
    enterSecret();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const before = screen.getByLabelText('Current one-time code').textContent;
    expect(screen.getByText('0 seconds remaining')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(screen.getByText('29 seconds remaining')).toBeInTheDocument();
    vi.useRealTimers();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.getByLabelText('Current one-time code').textContent).not.toBe(before);
  });

  it('generates the current HOTP code and advances its counter', async () => {
    render(<TotpTool />);
    fireEvent.click(screen.getByRole('button', { name: 'HOTP (counter-based)' }));
    enterSecret();
    fireEvent.change(screen.getByLabelText('Counter'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next code' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Current one-time code')).not.toHaveTextContent('—');
    });
    expect(screen.getByLabelText('Counter')).toHaveValue(5);
  });

  it('loads all settings from a valid otpauth URI', () => {
    render(<TotpTool />);
    fireEvent.change(screen.getByLabelText('otpauth:// provisioning URI inspector'), {
      target: {
        value: 'otpauth://hotp/Acme%3Aalice?secret=JBSWY3DP&issuer=Acme&algorithm=SHA256'
          + '&digits=8&counter=5',
      },
    });
    expect(screen.getByRole('button', { name: 'HOTP (counter-based)' })).toHaveAttribute(
      'aria-pressed', 'true'
    );
    expect(screen.getByLabelText('Base32 secret')).toHaveValue('JBSWY3DP');
    expect(screen.getByLabelText('Account label')).toHaveValue('Acme:alice');
    expect(screen.getByLabelText('Issuer')).toHaveValue('Acme');
    expect(screen.getByLabelText('Algorithm')).toHaveValue('SHA-256');
    expect(screen.getByLabelText('Code digits')).toHaveValue('8');
    expect(screen.getByLabelText('Counter')).toHaveValue(5);
  });

  it('generates a random secret and provides copy feedback in a polite status', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<TotpTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate random secret' }));
    expect(screen.getByLabelText('Base32 secret').value).toMatch(/^[A-Z2-7]+$/);
    await waitFor(() => {
      expect(screen.getByLabelText('Current one-time code')).not.toHaveTextContent('—');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.getByRole('status')).toHaveTextContent('One-time code copied to clipboard.');
  });

  it('reports malformed input with an alert and keeps secrets only in memory', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(<TotpTool />);
    enterSecret('BAD!');
    expect(screen.getByRole('alert')).toHaveTextContent('outside A–Z and 2–7');
    fireEvent.change(screen.getByLabelText('otpauth:// provisioning URI inspector'), {
      target: { value: 'https://example.com' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('otpauth');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(setItem).not.toHaveBeenCalled();
  });
});
