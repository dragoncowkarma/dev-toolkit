import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StringEscaperTool from './StringEscaperTool.jsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('StringEscaperTool', () => {
  it('updates escaped JavaScript output as text is entered', async () => {
    render(<StringEscaperTool />);
    fireEvent.change(screen.getByLabelText('Plain text'), { target: { value: 'a\nb' } });
    await waitFor(() => expect(screen.getByLabelText('Escaped result')).toHaveValue('a\\nb'));
  });

  it('switches modes and languages to unescape HTML', async () => {
    render(<StringEscaperTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Unescape' }));
    fireEvent.change(screen.getByLabelText('Target language'), { target: { value: 'html' } });
    fireEvent.change(screen.getByLabelText('Escaped text'), { target: { value: '&lt;ok&gt;' } });
    await waitFor(() => expect(screen.getByLabelText('Plain text')).toHaveValue('<ok>'));
  });

  it('applies a preset and selected escaping options', async () => {
    render(<StringEscaperTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Unicode' }));
    fireEvent.click(screen.getByLabelText('Escape Unicode characters'));
    await waitFor(() => expect(screen.getByLabelText('Escaped result')).toHaveValue(
      'Hello, \\uc548\\ub155! \\ud83d\\ude80'
    ));
  });

  it('copies the live result and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<StringEscaperTool />);
    fireEvent.change(screen.getByLabelText('Plain text'), { target: { value: 'a\nb' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy' })); });
    expect(writeText).toHaveBeenCalledWith('a\\nb');
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard.');
  });
});
