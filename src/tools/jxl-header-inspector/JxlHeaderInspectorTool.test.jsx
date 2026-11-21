import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import JxlHeaderInspectorTool from './JxlHeaderInspectorTool.jsx';

describe('JxlHeaderInspectorTool', () => {
  it('shows a source-qualified error for invalid Base64 input', () => {
    render(<JxlHeaderInspectorTool />);
    fireEvent.change(screen.getByLabelText(/paste base64/i), { target: { value: 'bad!' } });
    fireEvent.click(screen.getByRole('button', { name: /inspect base64/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Base64 paste: invalid Base64 input.');
  });
});
