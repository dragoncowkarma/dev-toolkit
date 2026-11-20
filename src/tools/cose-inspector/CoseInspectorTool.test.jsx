import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import CoseInspectorTool from './CoseInspectorTool.jsx';

const SIGN1_HEX = 'd28443a10126a104436b69644568656c6c6f40';

afterEach(cleanup);

describe('CoseInspectorTool', () => {
  it('mounts and inspects a COSE_Sign1 message from user input', () => {
    render(<CoseInspectorTool />);

    fireEvent.change(screen.getByLabelText('COSE message'), { target: { value: SIGN1_HEX } });
    fireEvent.change(screen.getByLabelText('Input format'), { target: { value: 'hex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect message' }));

    expect(screen.getByLabelText('COSE inspection result')).toBeInTheDocument();
    expect(screen.getByText('COSE_Sign1')).toBeInTheDocument();
    expect(screen.getByText('Algorithm (1)')).toBeInTheDocument();
    expect(screen.getByText('aGVsbG8=')).toBeInTheDocument();
  });

  it('loads the local example and reports validation errors accessibly', () => {
    render(<CoseInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load COSE_Sign1 example' }));
    expect(screen.getByText('COSE_Sign1')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('COSE message'), { target: { value: 'not CBOR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect message' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      /input contains non-hexadecimal characters/,
    );
  });
});
