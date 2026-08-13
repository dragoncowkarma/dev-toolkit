import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CssSpecificityTool from './CssSpecificityTool.jsx';

describe('CssSpecificityTool', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(cleanup);

  it('renders selector breakdown cards with accessible scores', () => {
    render(<CssSpecificityTool />);
    expect(screen.getByRole('heading', { name: 'CSS Specificity Calculator' })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Specificity \(/)).toHaveLength(3);
    expect(screen.getByText('Cascade tuple (0, 1, 3, 2)')).toBeInTheDocument();
    expect(screen.getByLabelText('Specificity sort order')).toHaveValue('descending');
  });

  it('sorts entered selectors and shows invalid-selector feedback', () => {
    render(<CssSpecificityTool />);
    fireEvent.change(screen.getByLabelText('CSS selectors or declaration snippets'), {
      target: { value: 'p, #app, [' },
    });
    expect(screen.getByText('#app')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Invalid selector' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Specificity sort order'), {
      target: { value: 'ascending' },
    });
    expect(document.querySelector('.css-specificity__cards article code')).toHaveTextContent('p');
  });

  it('clears input and announces the action through its live region', () => {
    render(<CssSpecificityTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('CSS selectors or declaration snippets')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('Selector input cleared.');
  });

  it('copies the ordered results and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CssSpecificityTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy results' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('#hero')));
    expect(screen.getByRole('status')).toHaveTextContent('copied to clipboard');
  });

  it('compares selectors and names the higher-priority selector', () => {
    render(<CssSpecificityTool />);
    expect(screen.getByText('First selector wins: (0, 1, 1, 0).')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Second selector'), {
      target: { value: '#app#active' },
    });
    expect(screen.getByText('Second selector wins: (0, 2, 0, 0).')).toBeInTheDocument();
  });
});
