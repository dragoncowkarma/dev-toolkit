import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Lz4HeaderInspectorTool from './Lz4HeaderInspectorTool.jsx';

function selectFile(file) {
  const input = screen.getByLabelText('Choose an LZ4 file to inspect');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function localFile(bytes, name) {
  const file = new File([bytes], name);
  file.arrayBuffer = async () => Uint8Array.from(bytes).buffer;
  return file;
}

afterEach(cleanup);

describe('Lz4HeaderInspectorTool', () => {
  it('shows an accessible alert when a malformed local file is selected', async () => {
    render(<Lz4HeaderInspectorTool />);
    const file = localFile([0, 0, 0, 0], 'bad.lz4');
    await act(async () => selectFile(file));
    expect(await screen.findByRole('alert')).toHaveTextContent(/magic number/i);
  });

  it('shows a distinct legacy format message', async () => {
    render(<Lz4HeaderInspectorTool />);
    const file = localFile([2, 33, 76, 24], 'legacy.lz4');
    await act(async () => selectFile(file));
    expect(await screen.findByRole('status')).toHaveTextContent(/legacy frame detected/i);
  });
});
