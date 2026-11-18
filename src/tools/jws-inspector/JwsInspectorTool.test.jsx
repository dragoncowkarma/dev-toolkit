import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import JwsInspectorTool from './JwsInspectorTool.jsx';

const VALID_JWS =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXUyIsImtpZCI6ImRlbW8ta2V5In0.' +
  'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkphbmUgRG9lIn0.c2lnbmF0dXJl';

afterEach(cleanup);

describe('JwsInspectorTool', () => {
  it('mounts with an empty compact JWS input', () => {
    render(<JwsInspectorTool />);

    expect(screen.getByLabelText('Compact JWS')).toHaveValue('');
    expect(screen.getByText(/Signature verification is not performed/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the three segments and decoded header after input', () => {
    render(<JwsInspectorTool />);

    fireEvent.change(screen.getByLabelText('Compact JWS'), { target: { value: VALID_JWS } });

    expect(screen.getByTestId('protected-header-segment')).toHaveTextContent(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXUyIsImtpZCI6ImRlbW8ta2V5In0'
    );
    expect(screen.getByTestId('payload-segment')).toHaveTextContent(
      'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkphbmUgRG9lIn0'
    );
    expect(screen.getByTestId('signature-segment')).toHaveTextContent('c2lnbmF0dXJl');
    expect(screen.getByText('HS256')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'JSON payload' })).toBeInTheDocument();
  });

  it('shows parsing errors and clears them with the Clear button', () => {
    render(<JwsInspectorTool />);

    fireEvent.change(screen.getByLabelText('Compact JWS'), { target: { value: 'invalid' } });
    expect(screen.getByRole('alert')).toHaveTextContent('exactly 3 Base64URL segments');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('Compact JWS')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
