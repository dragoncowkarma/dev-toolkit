import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SqlTool from './SqlTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SqlTool formatting', () => {
  it('formats SQL in real time as the input changes', async () => {
    render(<SqlTool />);
    fireEvent.change(screen.getByLabelText('SQL input'), {
      target: { value: 'select id from users where id = 1' },
    });

    await waitFor(() =>
      expect(screen.getByLabelText('Formatted SQL')).toHaveValue(
        'SELECT id\nFROM users\nWHERE id = 1'
      )
    );
  });

  it('reacts to keyword case changes', async () => {
    render(<SqlTool />);
    fireEvent.change(screen.getByLabelText('SQL input'), {
      target: { value: 'select id from users' },
    });
    fireEvent.change(screen.getByLabelText('Keyword case'), { target: { value: 'lower' } });

    await waitFor(() =>
      expect(screen.getByLabelText('Formatted SQL')).toHaveValue('select id\nfrom users')
    );
  });

  it('reacts to indent width changes', async () => {
    render(<SqlTool />);
    fireEvent.change(screen.getByLabelText('SQL input'), {
      target: { value: 'select * from (select id from users) as sub' },
    });
    fireEvent.change(screen.getByLabelText('Indent width'), { target: { value: '4' } });

    await waitFor(() =>
      expect(screen.getByLabelText('Formatted SQL')).toHaveValue(
        'SELECT *\nFROM (\n    SELECT id\n    FROM users\n) AS sub'
      )
    );
  });

  it('switches to the minified tab and shows single-line output', async () => {
    render(<SqlTool />);
    fireEvent.change(screen.getByLabelText('SQL input'), {
      target: { value: 'select id,\n  name\nfrom users' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Minified' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Minified SQL')).toHaveValue('select id, name from users')
    );
  });

  it('marks the active output-mode button as pressed and the other as not', async () => {
    render(<SqlTool />);
    const formattedButton = screen.getByRole('button', { name: 'Formatted' });
    const minifiedButton = screen.getByRole('button', { name: 'Minified' });

    expect(formattedButton).toHaveAttribute('aria-pressed', 'true');
    expect(minifiedButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(minifiedButton);

    expect(formattedButton).toHaveAttribute('aria-pressed', 'false');
    expect(minifiedButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a friendly alert for an unterminated string literal', async () => {
    render(<SqlTool />);
    fireEvent.change(screen.getByLabelText('SQL input'), {
      target: { value: "SELECT * FROM users WHERE name = 'Ada" },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/unterminated string literal/i);
  });
});

describe('SqlTool presets and actions', () => {
  it('loads a sample query when a preset is selected', async () => {
    render(<SqlTool />);
    fireEvent.change(screen.getByLabelText('Sample query'), { target: { value: 'insert' } });

    await waitFor(() =>
      expect(screen.getByLabelText('SQL input').value).toContain('INSERT INTO users')
    );
  });

  it('clears the input and reports feedback', async () => {
    render(<SqlTool />);
    fireEvent.change(screen.getByLabelText('SQL input'), { target: { value: 'select 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText('SQL input')).toHaveValue('');
    expect(await screen.findByRole('status')).toHaveTextContent('Cleared.');
  });

  it('copies the active output and reports success feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<SqlTool />);
    fireEvent.change(screen.getByLabelText('SQL input'), { target: { value: 'select 1' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy output to clipboard' }));
    });

    expect(writeText).toHaveBeenCalledWith('SELECT 1');
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard.');
  });

  it('reports failure feedback when the clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });
    render(<SqlTool />);
    fireEvent.change(screen.getByLabelText('SQL input'), { target: { value: 'select 1' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy output to clipboard' }));
    });

    expect(screen.getByRole('status')).toHaveTextContent('Unable to copy to clipboard.');
  });
});
