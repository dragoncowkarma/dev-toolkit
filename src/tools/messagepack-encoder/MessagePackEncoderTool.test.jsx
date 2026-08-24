import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MessagePackEncoderTool from './MessagePackEncoderTool.jsx';
import { MAX_INPUT_BYTES } from './messagepackEncoder.utils.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MessagePackEncoderTool encoding and errors', () => {
  it('encodes JSON and shows every output format with its byte length', async () => {
    render(<MessagePackEncoderTool />);
    fireEvent.change(screen.getByLabelText('JSON value'), {
      target: { value: '{"hello":"world"}' },
    });

    expect(await screen.findByLabelText('Hex output'))
      .toHaveTextContent('81a568656c6c6fa5776f726c64');
    expect(screen.getByLabelText('Base64 output')).toHaveTextContent('gaVoZWxsb6V3b3JsZA==');
    expect(screen.getByLabelText('Base64URL output')).toHaveTextContent('gaVoZWxsb6V3b3JsZA');
    expect(screen.getByText('13 bytes encoded')).toBeInTheDocument();
  });

  it('loads JSON-only flat and nested samples and can clear the editor', async () => {
    render(<MessagePackEncoderTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Simple object' }));
    expect(await screen.findByLabelText('Hex output'))
      .toHaveTextContent('81a568656c6c6fa5776f726c64');

    fireEvent.click(screen.getByRole('button', { name: 'Nested object and array' }));
    expect(await screen.findByLabelText('Hex output')).toHaveTextContent('82a770726f6a656374');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('JSON value')).toHaveValue('');
    expect(screen.queryByLabelText('Hex output')).not.toBeInTheDocument();
  });

  it('renders malformed JSON, non-finite numbers, size, and depth errors as alerts', async () => {
    render(<MessagePackEncoderTool />);
    const input = screen.getByLabelText('JSON value');
    fireEvent.change(input, { target: { value: '{bad}' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Malformed JSON/i);

    fireEvent.change(input, { target: { value: '1e9999' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/NaN and Infinity/i);

    const tooDeep = `${'['.repeat(33)}0${']'.repeat(33)}`;
    fireEvent.change(input, { target: { value: tooDeep } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/nesting depth/i);

    fireEvent.change(input, { target: { value: 'x'.repeat(MAX_INPUT_BYTES + 1) } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/too large/i);
  });
});

describe('MessagePackEncoderTool clipboard feedback', () => {
  it('copies each output independently and announces success', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<MessagePackEncoderTool />);
    fireEvent.change(screen.getByLabelText('JSON value'), { target: { value: 'true' } });
    await screen.findByLabelText('Hex output');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy Hex' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy Base64' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy Base64URL' })));
    expect(navigator.clipboard.writeText).toHaveBeenNthCalledWith(1, 'c3');
    expect(navigator.clipboard.writeText).toHaveBeenNthCalledWith(2, 'ww==');
    expect(navigator.clipboard.writeText).toHaveBeenNthCalledWith(3, 'ww');
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard.');
  });

  it('reports clipboard failure as an alert', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<MessagePackEncoderTool />);
    fireEvent.change(screen.getByLabelText('JSON value'), { target: { value: 'true' } });
    await screen.findByRole('button', { name: 'Copy Hex' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy Hex' })));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy to clipboard.');
  });
});
