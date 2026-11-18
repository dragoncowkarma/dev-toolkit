import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import JweInspectorTool from './JweInspectorTool.jsx';

const validJwe = [
  'eyJhbGciOiJSU0EtT0FFUCIsImVuYyI6IkEyNTZHQ00iLCJraWQiOiJrZXktMSIsImN0eSI6IkpXVCJ9',
  'AQID',
  'BAUGBw',
  'CAkKCww',
  'DQ4PEBESExQ',
].join('.');

afterEach(cleanup);

describe('JweInspectorTool', () => {
  it('displays parsed protected header values and decoded segment lengths', () => {
    render(<JweInspectorTool />);
    fireEvent.change(screen.getByLabelText('JWE compact token'), { target: { value: validJwe } });

    expect(screen.getByRole('heading', { name: 'Protected Header' })).toBeInTheDocument();
    expect(screen.getByText('RSA-OAEP')).toBeInTheDocument();
    expect(screen.getByText('A256GCM')).toBeInTheDocument();
    expect(screen.getByText('key-1')).toBeInTheDocument();
    expect(screen.getByText('JWT')).toBeInTheDocument();
    expect(screen.getByText('3 bytes')).toBeInTheDocument();
    expect(screen.getByText('4 bytes')).toBeInTheDocument();
    expect(screen.getByText('5 bytes')).toBeInTheDocument();
    expect(screen.getByText('8 bytes')).toBeInTheDocument();
  });

  it.each([
    ['wrong segment count', 'one.two.three.four', 'exactly 5 dot-separated segments'],
    ['invalid Base64URL', '!!!!.AQID.BAUGBw.CAkKCww.DQ4PEBESExQ', 'invalid Base64URL'],
    ['non-JSON header', 'bm90LWpzb24.AQID.BAUGBw.CAkKCww.DQ4PEBESExQ', 'valid JSON'],
  ])('shows an accessible error for %s', (_, input, message) => {
    render(<JweInspectorTool />);
    fireEvent.change(screen.getByLabelText('JWE compact token'), { target: { value: input } });

    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });
});
