import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NanoIdCuidGenerator from './NanoIdCuidGenerator.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('NanoIdCuidGenerator', () => {
  it('generates a configured NanoID batch and inspects a generated value', () => {
    render(<NanoIdCuidGenerator />);

    fireEvent.change(screen.getByLabelText('NanoID length'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('NanoID alphabet'), { target: { value: 'ab' } });
    fireEvent.change(screen.getByLabelText('Batch size'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate NanoID' }));

    const generated = screen.getByLabelText('Generated identifiers').value.split('\n');
    expect(generated).toHaveLength(2);
    expect(generated.every((identifier) => /^[ab]{6}$/.test(identifier))).toBe(true);

    fireEvent.change(screen.getByLabelText('Validate or inspect an identifier'), {
      target: { value: generated[0] },
    });
    expect(screen.getAllByText('NanoID')).toHaveLength(2);
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('allows numeric fields to be cleared before normalizing them on blur', () => {
    render(<NanoIdCuidGenerator />);

    const lengthInput = screen.getByLabelText('NanoID length');
    const batchSizeInput = screen.getByLabelText('Batch size');
    fireEvent.change(lengthInput, { target: { value: '' } });
    fireEvent.change(batchSizeInput, { target: { value: '' } });

    expect(lengthInput.value).toBe('');
    expect(batchSizeInput.value).toBe('');

    fireEvent.blur(lengthInput);
    fireEvent.blur(batchSizeInput);

    expect(lengthInput.value).toBe('21');
    expect(batchSizeInput.value).toBe('1');
  });

  it('announces successful copies in a polite status region', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<NanoIdCuidGenerator />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate NanoID' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');
  });
});
