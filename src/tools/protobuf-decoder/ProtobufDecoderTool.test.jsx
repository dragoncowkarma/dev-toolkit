import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProtobufDecoderTool from './ProtobufDecoderTool.jsx';

const REFERENCE_HEX =
  '089601120774657374696e671a0308960120ffffffffffffffffff012d0000803f31000000000000f83f';
const REFERENCE_BASE64 = 'CJYBEgd0ZXN0aW5nGgMIlgEg////////////AS0AAIA/MQAAAAAAAPg/';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ProtobufDecoderTool', () => {
  it('renders the decoded tree and expands or collapses a nested message', async () => {
    render(<ProtobufDecoderTool />);
    fireEvent.change(screen.getByLabelText('Protobuf payload'), {
      target: { value: REFERENCE_HEX },
    });

    expect(await screen.findByText('Decoded field tree (6 fields)')).toBeInTheDocument();
    expect(screen.getByText('18446744073709551615')).toBeInTheDocument();
    const nestedHeader = screen.getByRole('button', { name: /Field 3 LEN byte 12/i });
    expect(nestedHeader).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(nestedHeader);
    expect(nestedHeader).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(nestedHeader);
    expect(await screen.findByText('submessage (also available as raw hex)')).toBeInTheDocument();
  });

  it('shows explicit and auto-resolved input formats', async () => {
    render(<ProtobufDecoderTool />);
    const selector = screen.getByLabelText('Payload format');
    fireEvent.change(screen.getByLabelText('Protobuf payload'), {
      target: { value: REFERENCE_BASE64 },
    });
    expect(await screen.findByText('Resolved: base64')).toBeInTheDocument();
    fireEvent.change(selector, { target: { value: 'hex' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/non-hexadecimal/i);
    fireEvent.change(selector, { target: { value: 'base64' } });
    expect(await screen.findByText('Decoded field tree (6 fields)')).toBeInTheDocument();
  });

  it('shows copy success and failure feedback', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<ProtobufDecoderTool />);
    fireEvent.change(screen.getByLabelText('Protobuf payload'), {
      target: { value: REFERENCE_HEX },
    });
    await screen.findByText('Decoded field tree (6 fields)');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy whole tree' })));
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard.');

    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Copy uint64' })[0]);
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy to clipboard.');
  });

  it('renders parsing failures inline as an alert', async () => {
    render(<ProtobufDecoderTool />);
    fireEvent.change(screen.getByLabelText('Protobuf payload'), { target: { value: '0' } });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/odd number/i));
  });
});
