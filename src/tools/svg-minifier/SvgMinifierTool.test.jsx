import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SvgMinifierTool from './SvgMinifierTool.jsx';

const VALID_SVG = '<svg viewBox="0 0 24 24">\n  <!-- remove -->\n  <path d="M0 0" />\n</svg>';

function getInput() {
  return screen.getByLabelText('Raw SVG markup');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SvgMinifierTool', () => {
  it('renders, minifies input, displays byte savings, and shows a live preview', () => {
    render(<SvgMinifierTool />);

    fireEvent.change(getInput(), { target: { value: VALID_SVG } });
    fireEvent.click(screen.getByRole('button', { name: 'Minify SVG' }));

    expect(screen.getByLabelText('Minified SVG markup output')).toHaveValue(
      '<svg viewBox="0 0 24 24"><path d="M0 0" /></svg>',
    );
    expect(screen.getByText(/B → .*saved/)).toBeInTheDocument();
    expect(screen.getByLabelText('Minified SVG preview')).toBeInTheDocument();
  });

  it('loads the embedded sample and clears all input, output, and preview state', () => {
    render(<SvgMinifierTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }));
    expect(getInput().value).toContain('inkscape:version');

    fireEvent.click(screen.getByRole('button', { name: 'Minify SVG' }));
    expect(screen.getByLabelText('Minified SVG preview')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(getInput()).toHaveValue('');
    expect(screen.getByLabelText('Minified SVG markup output')).toHaveValue('');
    expect(screen.queryByLabelText('Minified SVG preview')).not.toBeInTheDocument();
  });

  it('copies each output with distinct accessible labels and success feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<SvgMinifierTool />);

    fireEvent.change(getInput(), { target: { value: VALID_SVG } });
    fireEvent.click(screen.getByRole('button', { name: 'Minify SVG' }));

    const copyButtons = [
      ['Copy minified SVG markup', 'minified SVG markup'],
      ['Copy CSS background-image data URI', 'CSS data URI'],
      ['Copy base64 image data URI', 'base64 image data URI'],
    ];

    for (const [buttonName, label] of copyButtons) {
      fireEvent.click(screen.getByRole('button', { name: buttonName }));
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`Copied ${label}`));
    }

    expect(writeText).toHaveBeenCalledTimes(3);
  });

  it('reports a copy failure in the polite status region', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });
    render(<SvgMinifierTool />);

    fireEvent.change(getInput(), { target: { value: VALID_SVG } });
    fireEvent.click(screen.getByRole('button', { name: 'Minify SVG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy minified SVG markup' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Could not copy minified SVG markup');
    });
  });

  it('surfaces malformed input in an alert without rendering a preview', () => {
    render(<SvgMinifierTool />);

    fireEvent.change(getInput(), { target: { value: '<svg><path></svg>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Minify SVG' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/unbalanced/i);
    expect(screen.queryByLabelText('Minified SVG preview')).not.toBeInTheDocument();
  });
});
