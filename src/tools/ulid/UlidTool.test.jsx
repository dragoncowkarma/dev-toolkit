import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UlidTool from './UlidTool.jsx';

afterEach(cleanup);

function getGeneratedUlids() {
  return screen.getAllByRole('listitem').map((item) => item.querySelector('code').textContent);
}

describe('UlidTool generation', () => {
  it('generates an inspectable batch with a custom timestamp', () => {
    render(<UlidTool />);

    fireEvent.click(screen.getByLabelText('Custom time'));
    fireEvent.change(screen.getByLabelText('ISO 8601 or Unix milliseconds'), {
      target: { value: '1700000000000' },
    });
    fireEvent.change(screen.getByLabelText('Batch size'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate 3 ULIDs' }));

    const ulids = getGeneratedUlids();
    expect(ulids).toHaveLength(3);
    expect(ulids.every((ulid) => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(ulid))).toBe(true);
    expect(screen.getByLabelText('Decoded ULID details')).toHaveTextContent(
      '2023-11-14T22:13:20.000Z'
    );
  });

  it('shows clear validation errors for invalid custom timestamps and ULIDs', () => {
    render(<UlidTool />);

    fireEvent.click(screen.getByLabelText('Custom time'));
    fireEvent.click(screen.getByRole('button', { name: 'Generate 1 ULID' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an ISO 8601 date/time');

    fireEvent.change(screen.getByLabelText('ULID'), {
      target: { value: '0000000000000000000000000I' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect ULID' }));
    expect(screen.getByText(/not a valid Crockford/)).toHaveAttribute('role', 'alert');
  });
});

describe('UlidTool clipboard management', () => {
  it('copies one ULID and provides accessible feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<UlidTool />);

    const ulid = getGeneratedUlids()[0];
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy ULID 1' }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(ulid);
    expect(screen.getByRole('status')).toHaveTextContent('ULID 1 copied to clipboard.');
  });

  it('copies every generated ULID', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<UlidTool />);

    const ulids = getGeneratedUlids();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(ulids.join('\n'));
    expect(screen.getByRole('status')).toHaveTextContent('All ULIDs copied to clipboard.');
  });
});
