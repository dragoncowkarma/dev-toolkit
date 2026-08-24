import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProtobufEncoderTool from './ProtobufEncoderTool.jsx';

describe('ProtobufEncoderTool', () => {
  it('renders encoded output and reports invalid JSON inline', () => {
    render(<ProtobufEncoderTool />);

    expect(screen.getByLabelText('Hex')).toHaveValue(
      '08 96 01 12 05 48 65 6c 6c 6f 1d 2a 00 00 00',
    );

    fireEvent.change(screen.getByLabelText('Field definitions (JSON)'), { target: { value: '{' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid JSON');
    expect(screen.queryByLabelText('Hex')).not.toBeInTheDocument();
  });
});
