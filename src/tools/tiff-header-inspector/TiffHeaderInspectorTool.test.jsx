import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import TiffHeaderInspectorTool from './TiffHeaderInspectorTool.jsx';

afterEach(cleanup);

describe('TiffHeaderInspectorTool', () => {
  it('shows a visible alert when reading the selected file fails', async () => {
    render(<TiffHeaderInspectorTool />);
    const input = screen.getByLabelText('Select a TIFF file to inspect');
    const file = {
      name: 'broken.tif',
      arrayBuffer: () => Promise.reject(new Error('Read failed.')),
    };
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    expect(await screen.findByRole('alert')).toHaveTextContent('Read failed.');
  });

  it('shows parsed TIFF tags from a local File arrayBuffer', async () => {
    const bytes = new Uint8Array(26);
    const view = new DataView(bytes.buffer);
    bytes.set([0x49, 0x49]);
    view.setUint16(2, 42, true);
    view.setUint32(4, 8, true);
    view.setUint16(8, 1, true);
    view.setUint16(10, 256, true);
    view.setUint16(12, 4, true);
    view.setUint32(14, 1, true);
    view.setUint32(18, 10, true);
    view.setUint32(22, 0, true);
    render(<TiffHeaderInspectorTool />);
    const input = screen.getByLabelText('Select a TIFF file to inspect');
    const file = { name: 'image.tif', arrayBuffer: () => Promise.resolve(bytes.buffer) };
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    await waitFor(() => expect(screen.getByText('ImageWidth (256)')).toBeInTheDocument());
    expect(screen.getByText('Little-endian (II)')).toBeInTheDocument();
  });
});
