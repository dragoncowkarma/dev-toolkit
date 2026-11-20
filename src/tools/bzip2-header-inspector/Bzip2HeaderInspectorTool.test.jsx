import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Bzip2HeaderInspectorTool from './Bzip2HeaderInspectorTool.jsx';

describe('Bzip2HeaderInspectorTool', () => {
  it('renders malformed input warnings as an alert', async () => {
    render(<Bzip2HeaderInspectorTool />);

    const file = new File([Uint8Array.from([0x00, 0x5a, 0x68, 0x31])], 'invalid.bz2');
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => Uint8Array.from([0x00, 0x5a, 0x68, 0x31]).buffer,
    });
    const input = screen.getByLabelText('Select BZip2 file');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid BZip2 magic bytes');
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
  });
});
