import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import WebpHeaderInspectorTool from './WebpHeaderInspectorTool.jsx';

function corruptWebpFile() {
  const bytes = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
  return { arrayBuffer: () => Promise.resolve(bytes.buffer), name: 'broken.webp' };
}

describe('WebpHeaderInspectorTool', () => {
  it('renders a clear alert for a corrupt WebP file instead of throwing', async () => {
    render(<WebpHeaderInspectorTool />);
    const input = screen.getByLabelText('Select a WebP file');
    Object.defineProperty(input, 'files', { value: [corruptWebpFile()], configurable: true });

    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid chunk padding/i);
    });
    expect(screen.getByText('Inspecting: broken.webp')).toBeInTheDocument();
  });
});
