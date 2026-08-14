import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SriGeneratorTool from './SriGeneratorTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SriGeneratorTool', () => {
  it('renders accessible controls and generates a script tag', async () => {
    render(<SriGeneratorTool />);
    expect(screen.getByLabelText('Resource content')).toBeInTheDocument();
    expect(screen.getByLabelText('Algorithm')).toHaveValue('sha384');
    expect(screen.getByText('Generated output').parentElement.parentElement)
      .toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Integrity metadata generated locally.'))
      .toHaveAttribute('aria-live', 'polite'));

    fireEvent.change(screen.getByLabelText('Resource content'), { target: { value: 'hello' } });
    fireEvent.change(screen.getByLabelText('Resource URL (optional)'), {
      target: { value: 'https://cdn.example.com/app.js' },
    });
    await waitFor(() => expect(screen.getByLabelText('Generated SRI output')).toHaveTextContent(
      '<script src="https://cdn.example.com/app.js" integrity="sha384-'
    ));
  });

  it('loads a sample, switches algorithms and output type, then clears state', async () => {
    render(<SriGeneratorTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }));
    expect(screen.getByLabelText('Resource content'))
      .toHaveValue("console.log('SRI protected asset');");
    expect(screen.getByLabelText('Algorithm')).toHaveValue('all');
    await waitFor(() => expect(screen.getByLabelText('Generated SRI output'))
      .toHaveTextContent('sha256-'));

    fireEvent.change(screen.getByLabelText('Output type'), { target: { value: 'raw' } });
    expect(screen.getByLabelText('Crossorigin')).toBeDisabled();
    await waitFor(() => expect(screen.getByLabelText('Generated SRI output'))
      .not.toHaveTextContent('<script'));

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('Resource content')).toHaveValue('');
    expect(screen.getByLabelText('Algorithm')).toHaveValue('sha384');
    expect(screen.getByLabelText('Expected integrity attribute (optional validation)'))
      .toHaveValue('');
  });

  it('copies output and reports integrity validation feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<SriGeneratorTool />);
    fireEvent.change(screen.getByLabelText('Resource content'), { target: { value: 'hello' } });
    await waitFor(() => expect(screen.getByLabelText('Generated SRI output'))
      .toHaveTextContent('sha384-'));
    const output = screen.getByLabelText('Generated SRI output').textContent;
    fireEvent.change(screen.getByLabelText('Expected integrity attribute (optional validation)'), {
      target: { value: output.match(/sha384-[^"]+/)[0] },
    });
    await waitFor(() => expect(screen.getByText(/Integrity validation passed/))
      .toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Copy output' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(output));
    expect(screen.getByText('Output copied to clipboard.')).toBeInTheDocument();
  });
});
