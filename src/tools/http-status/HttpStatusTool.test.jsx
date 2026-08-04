import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HttpStatusTool from './HttpStatusTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('HttpStatusTool', () => {
  it('updates the list and result count when searching', () => {
    render(<HttpStatusTool />);
    fireEvent.change(screen.getByLabelText('Search HTTP status codes'), {
      target: { value: 'not found' },
    });
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 status code found.');
  });

  it('filters by class and composes class filtering with search', () => {
    render(<HttpStatusTool />);
    fireEvent.click(screen.getByRole('button', { name: '4xx' }));
    expect(screen.getByRole('button', { name: '4xx' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('404')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search HTTP status codes'), {
      target: { value: 'not found' },
    });
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.queryByText('200')).not.toBeInTheDocument();
  });

  it('renders an empty state for unmatched filters', () => {
    render(<HttpStatusTool />);
    fireEvent.change(screen.getByLabelText('Search HTTP status codes'), {
      target: { value: 'not-a-status' },
    });
    expect(screen.getByText('No HTTP status codes match your search.')).toBeInTheDocument();
  });

  it('copies a numeric code and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<HttpStatusTool />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy status code 404' }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith('404');
    expect(screen.getAllByRole('status')[1]).toHaveTextContent('404 copied to clipboard.');
  });

  it('announces a copy failure', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<HttpStatusTool />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy status code 404' }));
      await Promise.resolve();
    });
    expect(screen.getAllByRole('status')[1]).toHaveTextContent('Unable to copy 404');
  });
});
