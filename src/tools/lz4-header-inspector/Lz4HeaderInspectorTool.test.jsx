import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Lz4HeaderInspectorTool from './Lz4HeaderInspectorTool.jsx';

describe('Lz4HeaderInspectorTool', () => {
  it('shows a visible alert for an invalid local file', async () => {
    render(<Lz4HeaderInspectorTool />);
    const input = screen.getByLabelText('Choose an LZ4 frame file');
    const file = new File([new Uint8Array([0, 1, 2, 3])], 'invalid.lz4');
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid LZ4 frame magic number');
  });
});
