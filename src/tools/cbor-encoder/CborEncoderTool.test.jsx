import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CborEncoderTool from './CborEncoderTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CborEncoderTool encoding and errors', () => {
  it('encodes JSON and shows every output format with its byte length', async () => {
    render(<CborEncoderTool />);
    fireEvent.change(screen.getByLabelText('CBOR value'), {
      target: { value: '{"hello":"world"}' },
    });

    expect(await screen.findByLabelText('Hex output'))
      .toHaveTextContent('a16568656c6c6f65776f726c64');
    expect(screen.getByLabelText('Base64 output')).toHaveTextContent('oWVoZWxsb2V3b3JsZA==');
    expect(screen.getByLabelText('Base64URL output')).toHaveTextContent('oWVoZWxsb2V3b3JsZA');
    expect(screen.getByText('13 bytes encoded')).toBeInTheDocument();
  });

  it('encodes diagnostic byte strings and reports malformed inputs accessibly', async () => {
    render(<CborEncoderTool />);
    fireEvent.change(screen.getByLabelText('Input syntax'), { target: { value: 'diagnostic' } });
    fireEvent.change(screen.getByLabelText('CBOR value'), { target: { value: "h'0102'" } });
    expect(await screen.findByLabelText('Hex output')).toHaveTextContent('420102');

    fireEvent.change(screen.getByLabelText('CBOR value'), { target: { value: "h'0'" } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Malformed diagnostic notation/i);
    expect(screen.queryByLabelText('Hex output')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Input syntax'), { target: { value: 'json' } });
    fireEvent.change(screen.getByLabelText('CBOR value'), { target: { value: '{bad}' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Malformed JSON/i);

    fireEvent.change(screen.getByLabelText('Input syntax'), { target: { value: 'diagnostic' } });
    fireEvent.change(screen.getByLabelText('CBOR value'), { target: { value: '{true: 1}' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Map keys/i);
  });

  it('loads all round-trip samples and can clear the editor', async () => {
    render(<CborEncoderTool />);
    fireEvent.click(screen.getByRole('button', { name: 'WebAuthn attestation-style' }));
    expect(await screen.findByLabelText('Hex output')).toHaveTextContent('44deadbeef');

    fireEvent.click(screen.getByRole('button', { name: 'Tagged timestamp and bignum' }));
    expect(await screen.findByLabelText('Hex output')).toHaveTextContent('c249010000000000000000');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('CBOR value')).toHaveValue('');
    expect(screen.queryByLabelText('Hex output')).not.toBeInTheDocument();
  });
});

describe('CborEncoderTool clipboard feedback', () => {
  it('copies each output independently and announces success', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<CborEncoderTool />);
    fireEvent.change(screen.getByLabelText('CBOR value'), { target: { value: 'true' } });
    await screen.findByLabelText('Hex output');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy Hex' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy Base64' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy Base64URL' })));
    expect(navigator.clipboard.writeText).toHaveBeenNthCalledWith(1, 'f5');
    expect(navigator.clipboard.writeText).toHaveBeenNthCalledWith(2, '9Q==');
    expect(navigator.clipboard.writeText).toHaveBeenNthCalledWith(3, '9Q');
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard.');
  });

  it('reports clipboard failure as an alert', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<CborEncoderTool />);
    fireEvent.change(screen.getByLabelText('CBOR value'), { target: { value: 'true' } });
    await screen.findByRole('button', { name: 'Copy Hex' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy Hex' })));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy to clipboard.');
  });
});
