import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UnicodeTool from './UnicodeTool.jsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('UnicodeTool', () => {
  it('recomputes the inspection table while typing', () => {
    render(<UnicodeTool />);
    fireEvent.change(screen.getByLabelText('Text to inspect'), { target: { value: 'A' } });
    expect(screen.getByRole('cell', { name: 'U+0041' })).toBeInTheDocument();
  });

  it('renders an astral character as one inspection row', () => {
    render(<UnicodeTool />);
    fireEvent.change(screen.getByLabelText('Text to inspect'), { target: { value: '😀' } });
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('F0 9F 98 80')).toBeInTheDocument();
  });

  it('shows invisible hits and the clean none-found state', () => {
    render(<UnicodeTool />);
    expect(screen.getByText('No invisible characters found.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Text to inspect'), { target: { value: 'A\u200B' } });
    expect(screen.getByText(/Zero-width space/)).toBeInTheDocument();
  });

  it('shows changed and unchanged normalization indicators', () => {
    render(<UnicodeTool />);
    fireEvent.change(screen.getByLabelText('Text to inspect'), { target: { value: 'ﬁ' } });
    expect(screen.getAllByText('Changed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unchanged').length).toBeGreaterThan(0);
  });

  it('shows a distinct invalid lookup state', () => {
    render(<UnicodeTool />);
    fireEvent.change(screen.getByLabelText('Code point'), { target: { value: 'U+D800' } });
    expect(screen.getByText('Invalid code point.')).toBeInTheDocument();
  });

  it('reports copy success and failure through the live status region', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<UnicodeTool />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy NFC normalization' }));
    });
    expect(screen.getByText('NFC copied to clipboard.')).toBeInTheDocument();
    writeText.mockRejectedValueOnce(new Error('blocked'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy NFD normalization' }));
    });
    expect(screen.getByText('Unable to copy NFD.')).toBeInTheDocument();
  });
});
