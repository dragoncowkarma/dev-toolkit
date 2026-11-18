import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import WebpHeaderInspectorTool from './WebpHeaderInspectorTool.jsx';

describe('WebpHeaderInspectorTool', () => {
  it('renders an alert for corrupt files without throwing', async () => {
    render(<WebpHeaderInspectorTool />);
    const file = new File([new Uint8Array([0x52, 0x49, 0x46, 0x46])], 'broken.webp', {
      type: 'image/webp',
    });
    const input = screen.getByLabelText('Choose a WebP file');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid WebP file');
  });
});
