import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HmacTool from './HmacTool.jsx';

describe('HmacTool', () => {
  afterEach(() => cleanup());

  function fillInputs(key = 'key', message = 'message') {
    fireEvent.change(screen.getByRole('textbox', { name: 'Secret key' }), { target: { value: key } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: message } });
  }
  it('computes a signature in real time', async () => {
    render(<HmacTool />); fillInputs();
    await waitFor(() => expect(screen.getByLabelText('HMAC signature')).not.toHaveTextContent('—'));
  });
  it('changes output when selecting another algorithm', async () => {
    render(<HmacTool />); fillInputs();
    await waitFor(() => expect(screen.getByLabelText('HMAC signature')).not.toHaveTextContent('—'));
    const before = screen.getByLabelText('HMAC signature').textContent;
    fireEvent.change(screen.getByLabelText('HMAC algorithm'), { target: { value: 'SHA-512' } });
    await waitFor(() => expect(screen.getByLabelText('HMAC signature').textContent).not.toBe(before));
  });
  it('supports changing key encoding', async () => {
    render(<HmacTool />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Secret key encoding' }), {
      target: { value: 'Hex' },
    });
    fillInputs('6b6579');
    await waitFor(() => expect(screen.getByLabelText('HMAC signature')).not.toHaveTextContent('—'));
  });
  it('copies a generated signature', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<HmacTool />); fillInputs();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy HMAC signature' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Copy HMAC signature' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.getByText('Signature copied to clipboard.')).toBeInTheDocument();
  });
  it('displays valid and invalid verification statuses', async () => {
    render(<HmacTool />); fillInputs();
    fireEvent.click(screen.getByRole('button', { name: 'Verify HMAC' }));
    fireEvent.change(screen.getByLabelText('Target HMAC signature'), {
      target: { value: '6e9ef29b75fffc5b7abae527d58fdadb2f2f5f16f3f1af06a0f7d0f1d5f8f19c' },
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Invalid signature'));
  });
});
