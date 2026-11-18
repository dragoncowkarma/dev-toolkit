import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import OggInspectorTool from './OggInspectorTool.jsx';

describe('OggInspectorTool', () => {
  it('shows a parser error for malformed Base64-decoded Ogg data', () => {
    render(<OggInspectorTool />);
    fireEvent.change(screen.getByLabelText('Base64 input'), { target: { value: 'T2dnUw==' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Base64' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Ogg page 0 header');
  });
});
