import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CssFormatterTool from './CssFormatterTool.jsx';

function getInput() {
  return screen.getByLabelText('CSS input');
}

function getOutput() {
  return screen.getByLabelText('Formatted output');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CssFormatterTool Format', () => {
  it('formats the input CSS into the output pane with 2-space indentation', () => {
    render(<CssFormatterTool />);

    fireEvent.change(getInput(), { target: { value: '.a{color:red;}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));

    expect(getOutput()).toHaveValue('.a {\n  color: red;\n}');
  });

  it('formats with 4-space indentation when selected', () => {
    render(<CssFormatterTool />);

    fireEvent.change(screen.getByLabelText('Indentation size'), { target: { value: '4' } });
    fireEvent.change(getInput(), { target: { value: '.a{color:red;}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));

    expect(getOutput()).toHaveValue('.a {\n    color: red;\n}');
  });
});

describe('CssFormatterTool Minify', () => {
  it('minifies the input CSS into the output pane', () => {
    render(<CssFormatterTool />);

    fireEvent.change(getInput(), { target: { value: '.a {\n  color: red;\n}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Minify' }));

    expect(getOutput()).toHaveValue('.a{color:red}');
  });
});

describe('CssFormatterTool malformed input', () => {
  it('shows a warning alert and leaves the input unchanged for unbalanced braces', () => {
    render(<CssFormatterTool />);

    fireEvent.change(getInput(), { target: { value: '.a { color: red;' } });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/malformed|unbalanced/i);
    expect(getOutput()).toHaveValue('.a { color: red;');
  });
});

describe('CssFormatterTool empty input', () => {
  it('reports empty input via the status region without producing output', () => {
    render(<CssFormatterTool />);

    fireEvent.change(getInput(), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));

    expect(screen.getByText('Input is empty - nothing to format.')).toBeInTheDocument();
    expect(getOutput()).toHaveValue('');
  });
});

describe('CssFormatterTool Clear', () => {
  it('resets input and output', () => {
    render(<CssFormatterTool />);

    fireEvent.change(getInput(), { target: { value: '.a{color:red;}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    expect(getOutput()).toHaveValue('.a {\n  color: red;\n}');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(getInput()).toHaveValue('');
    expect(getOutput()).toHaveValue('');
  });
});

describe('CssFormatterTool Copy', () => {
  it('copies the output to the clipboard and announces success via the live region', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CssFormatterTool />);

    fireEvent.change(getInput(), { target: { value: '.a{color:red;}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(writeText).toHaveBeenCalledWith('.a {\n  color: red;\n}');
    expect(await screen.findByText('Copied output to clipboard.')).toBeInTheDocument();
  });

  it('announces failure when the clipboard API is unavailable', async () => {
    Object.assign(navigator, { clipboard: undefined });

    render(<CssFormatterTool />);

    fireEvent.change(getInput(), { target: { value: '.a{color:red;}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not copy output to clipboard.',
    );
  });

  it('disables the Copy button when there is no output yet', () => {
    render(<CssFormatterTool />);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  });
});
