import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import WebpHeaderInspectorTool from './WebpHeaderInspectorTool.jsx';

function corruptedWebpFile() {
  return new File([new Uint8Array([0x52, 0x49, 0x46, 0x46])], 'broken.webp', {
    type: 'image/webp',
  });
}

describe('WebpHeaderInspectorTool', () => {
  it('renders a clear alert for a corrupt WebP file', async () => {
    render(<WebpHeaderInspectorTool />);
    const input = screen.getByLabelText('Choose a WebP file');
    Object.defineProperty(input, 'files', { value: [corruptedWebpFile()] });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/truncated/i));
  });
});
