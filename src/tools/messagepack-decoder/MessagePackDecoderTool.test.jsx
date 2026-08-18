import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MessagePackDecoderTool from './MessagePackDecoderTool.jsx';

const VECTOR_A_HEX = '82a7636f6d70616374c3a6736368656d6100';
const VECTOR_A_BASE64 = 'gqdjb21wYWN0w6ZzY2hlbWEA';
const NESTED_MAP_HEX = '81a161920102';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MessagePackDecoderTool', () => {
  it('renders the nested field tree and expands or collapses containers', async () => {
    render(<MessagePackDecoderTool />);
    fireEvent.change(screen.getByLabelText('MessagePack payload'), {
      target: { value: NESTED_MAP_HEX },
    });

    expect(await screen.findByText('Decoded MessagePack tree')).toBeInTheDocument();
    expect(screen.getByText('2 items')).toBeInTheDocument();
    const mapToggle = screen.getByRole('button', { name: 'Collapse map at byte 0' });
    fireEvent.click(mapToggle);
    expect(mapToggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(mapToggle);
    const arrayToggle = await screen.findByRole('button', { name: 'Collapse array at byte 3' });
    fireEvent.click(arrayToggle);
    expect(arrayToggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows auto and explicitly selected formats with the resolved selection', async () => {
    render(<MessagePackDecoderTool />);
    fireEvent.change(screen.getByLabelText('MessagePack payload'), {
      target: { value: VECTOR_A_BASE64 },
    });
    expect(await screen.findByText('Resolved: base64')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Payload format'), { target: { value: 'hex' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/non-hexadecimal/i);
    fireEvent.change(screen.getByLabelText('Payload format'), { target: { value: 'base64' } });
    expect(await screen.findByText('Decoded MessagePack tree')).toBeInTheDocument();
  });

  it('shows clipboard success and failure feedback', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<MessagePackDecoderTool />);
    fireEvent.change(screen.getByLabelText('MessagePack payload'), {
      target: { value: VECTOR_A_HEX },
    });
    await screen.findByText('Decoded MessagePack tree');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy whole tree' })));
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard.');

    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy bool value at byte 9' }));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy to clipboard.');
  });

  it('renders malformed input and decoding failures inline as alerts', async () => {
    render(<MessagePackDecoderTool />);
    fireEvent.change(screen.getByLabelText('MessagePack payload'), { target: { value: '0' } });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/odd number/i));
    fireEvent.change(screen.getByLabelText('MessagePack payload'), { target: { value: 'c1' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Reserved MessagePack.*byte offset 0/i,
    );
  });
});
