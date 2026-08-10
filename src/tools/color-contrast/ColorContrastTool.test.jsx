import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ColorContrastTool from './ColorContrastTool.jsx';

describe('ColorContrastTool', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(cleanup);

  it('renders the default pair and all WCAG results', () => {
    render(<ColorContrastTool />);
    expect(screen.getByRole('heading', { name: 'Color Contrast Checker' })).toBeInTheDocument();
    expect(screen.getByLabelText('Foreground')).toHaveValue('#111827');
    expect(screen.getByLabelText('Background')).toHaveValue('#FFFFFF');
    expect(screen.getByText('17.74:1')).toBeInTheDocument();
    expect(screen.getAllByText('Pass')).toHaveLength(4);
  });

  it('renders an accessible parse error without throwing', () => {
    render(<ColorContrastTool />);
    fireEvent.change(screen.getByLabelText('Foreground'), { target: { value: 'invalid' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Foreground: Unable to parse');
  });

  it('loads a sample, swaps the pair, and recomputes the same symmetric ratio', () => {
    render(<ColorContrastTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }));
    const before = screen.getByText(/:1$/).textContent;
    expect(screen.getByLabelText('Foreground')).toHaveValue('#1E3A8A');

    fireEvent.click(screen.getByRole('button', { name: 'Swap foreground and background' }));
    expect(screen.getByLabelText('Foreground')).toHaveValue('#DBEAFE');
    expect(screen.getByLabelText('Background')).toHaveValue('#1E3A8A');
    expect(screen.getByText(before)).toBeInTheDocument();
  });

  it('keeps the native picker and text input synchronized', () => {
    render(<ColorContrastTool />);
    fireEvent.change(screen.getByLabelText('Foreground color picker'), {
      target: { value: '#ff0000' },
    });
    expect(screen.getByLabelText('Foreground')).toHaveValue('#FF0000');
  });

  it('copies a summary and announces accessible feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ColorContrastTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy summary' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('17.74:1')));
    expect(screen.getByRole('status')).toHaveTextContent('copied to clipboard');
  });
});
