import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MacAddressTool from './MacAddressTool.jsx';

afterEach(cleanup);

describe('MacAddressTool', () => {
  it('loads a sample and shows all normalized formats and inspection results', () => {
    render(<MacAddressTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }));

    expect(screen.getByText('00:1A:2B:3C:4D:5E')).toBeInTheDocument();
    expect(screen.getByText('00-1A-2B-3C-4D-5E')).toBeInTheDocument();
    expect(screen.getByText('001a.2b3c.4d5e')).toBeInTheDocument();
    expect(screen.getByText('02:1A:2B:FF:FE:3C:4D:5E')).toBeInTheDocument();
    expect(screen.getByText('Unicast')).toBeInTheDocument();
    expect(screen.getByText('Universally Administered')).toBeInTheDocument();
  });

  it('shows an accessible error for invalid input and clears it', () => {
    render(<MacAddressTool />);
    const input = screen.getByLabelText('MAC address');
    fireEvent.change(input, { target: { value: 'invalid-mac' } });

    expect(screen.getByRole('alert')).toHaveTextContent('may contain only');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(input).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces successful copy operations through its status region', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<MacAddressTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy Colon' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Colon copied to clipboard.');
    expect(writeText).toHaveBeenCalledWith('00:1A:2B:3C:4D:5E');
  });
});
