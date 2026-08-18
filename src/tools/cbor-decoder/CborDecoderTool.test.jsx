import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CborDecoderTool from './CborDecoderTool.jsx';

const SIMPLE_MAP_HEX = 'a16568656c6c6f65776f726c64';
const SIMPLE_MAP_BASE64 = 'oWVoZWxsb2V3b3JsZA==';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CborDecoderTool input and results', () => {
  it('renders readable JSON, diagnostic notation, size, and major types for Hex', async () => {
    render(<CborDecoderTool />);
    fireEvent.change(screen.getByLabelText('CBOR payload'), { target: { value: SIMPLE_MAP_HEX } });

    expect(await screen.findByLabelText('Formatted JSON output')).toHaveTextContent('"hello": "world"');
    expect(screen.getByLabelText('Diagnostic notation output')).toHaveTextContent('{"hello": "world"}');
    expect(screen.getByText('13 bytes decoded')).toBeInTheDocument();
    expect(screen.getByText('5 Map: 1')).toBeInTheDocument();
  });

  it('accepts explicit Base64 and Base64URL input', async () => {
    render(<CborDecoderTool />);
    fireEvent.change(screen.getByLabelText('Payload format'), { target: { value: 'base64' } });
    fireEvent.change(screen.getByLabelText('CBOR payload'), { target: { value: SIMPLE_MAP_BASE64 } });
    expect(await screen.findByText('Resolved: base64')).toBeInTheDocument();
    expect(screen.getByLabelText('Formatted JSON output')).toHaveTextContent('hello');

    fireEvent.change(screen.getByLabelText('Payload format'), { target: { value: 'base64url' } });
    fireEvent.change(screen.getByLabelText('CBOR payload'), { target: { value: SIMPLE_MAP_BASE64.slice(0, -2) } });
    expect(await screen.findByText('Resolved: base64url')).toBeInTheDocument();
  });

  it('loads a sample and reports invalid CBOR in an alert without retaining output', async () => {
    render(<CborDecoderTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Simple map' }));
    expect(await screen.findByLabelText('Formatted JSON output')).toHaveTextContent('world');

    fireEvent.change(screen.getByLabelText('CBOR payload'), { target: { value: '43ff' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Truncated byte string/i);
    expect(screen.queryByLabelText('Formatted JSON output')).not.toBeInTheDocument();
  });

  it('clears the input and decoded UI state', async () => {
    render(<CborDecoderTool />);
    fireEvent.change(screen.getByLabelText('CBOR payload'), { target: { value: SIMPLE_MAP_HEX } });
    await screen.findByLabelText('Formatted JSON output');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('CBOR payload')).toHaveValue('');
    expect(screen.queryByLabelText('Formatted JSON output')).not.toBeInTheDocument();
  });
});

describe('CborDecoderTool local-file and copy interactions', () => {
  it('loads .cbor bytes from a local file', async () => {
    render(<CborDecoderTool />);
    const file = new File([Uint8Array.from([0xa1, 0x61, 0x61, 0x01])], 'sample.cbor');
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(Uint8Array.from([0xa1, 0x61, 0x61, 0x01]).buffer),
    });
    const input = screen.getByLabelText('Upload .cbor / .bin');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    expect(await screen.findByText('Loaded file: sample.cbor')).toBeInTheDocument();
    expect(screen.getByLabelText('Formatted JSON output')).toHaveTextContent('"a": 1');
  });

  it('rejects unrelated local file extensions', async () => {
    render(<CborDecoderTool />);
    const file = new File(['not cbor'], 'sample.txt');
    const input = screen.getByLabelText('Upload .cbor / .bin');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    expect(await screen.findByRole('alert')).toHaveTextContent(/\.cbor or \.bin/i);
  });

  it('copies formatted JSON and exposes an accessible status', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<CborDecoderTool />);
    fireEvent.change(screen.getByLabelText('CBOR payload'), { target: { value: SIMPLE_MAP_HEX } });
    await screen.findByLabelText('Formatted JSON output');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' })));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('{\n  "hello": "world"\n}');
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard.');
  });

  it('reports clipboard failures as an alert', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<CborDecoderTool />);
    fireEvent.change(screen.getByLabelText('CBOR payload'), { target: { value: SIMPLE_MAP_HEX } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeEnabled());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' })));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy to clipboard.');
  });
});
