import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SwfHeaderInspectorTool from './SwfHeaderInspectorTool.jsx';

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function withArrayBuffer(file, buffer) {
  Object.defineProperty(file, 'arrayBuffer', {
    configurable: true,
    value: vi.fn().mockResolvedValue(buffer),
  });
  return file;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SwfHeaderInspectorTool', () => {
  it('shows the decompression-required notice for compressed files', async () => {
    const file = withArrayBuffer(
      new File(['header'], 'movie.swf', { type: 'application/x-shockwave-flash' }),
      new Uint8Array([0x43, 0x57, 0x53, 12, 8, 0, 0, 0]).buffer
    );
    render(<SwfHeaderInspectorTool />);

    selectFile(screen.getByLabelText('Choose an SWF file to inspect'), file);

    expect(await screen.findByText('zlib-compressed')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Frame size, frame rate, and frame count require decompression and are not shown.'
    );
  });

  it('shows a user-facing error for an invalid file', async () => {
    const file = withArrayBuffer(new File(['bad'], 'bad.swf'), new Uint8Array(3).buffer);
    render(<SwfHeaderInspectorTool />);

    selectFile(screen.getByLabelText('Choose an SWF file to inspect'), file);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('too short or truncated');
    });
  });
});
