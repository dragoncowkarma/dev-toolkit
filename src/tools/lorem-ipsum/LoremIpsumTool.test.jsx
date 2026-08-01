import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoremIpsumTool from './LoremIpsumTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LoremIpsumTool generation', () => {
  it('reactively updates output and counters when quantity and options change', () => {
    render(<LoremIpsumTool />);

    const output = screen.getByLabelText('Generated Lorem Ipsum text');
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByLabelText('Sentences'));

    expect(output.value.split('\n\n')).toHaveLength(2);
    expect(screen.getByText(/words$/)).toBeInTheDocument();
    expect(screen.getByText(/characters$/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Include <p> tags'));
    expect(output).toHaveValue(expect.stringMatching(/^<p>.*<\/p>\n<p>.*<\/p>$/));
    expect(screen.getByText(/characters$/)).toBeInTheDocument();
  });

  it('provides accessible quantity step buttons', () => {
    render(<LoremIpsumTool />);

    fireEvent.click(screen.getByLabelText('Increase quantity'));
    expect(screen.getByLabelText('Quantity')).toHaveValue(4);

    fireEvent.click(screen.getByLabelText('Decrease quantity'));
    expect(screen.getByLabelText('Quantity')).toHaveValue(3);
  });
});

describe('LoremIpsumTool actions', () => {
  it('regenerates the output and reports the action', () => {
    const random = vi.spyOn(Math, 'random');
    random.mockReturnValueOnce(0).mockReturnValue(0.99);
    render(<LoremIpsumTool />);

    const output = screen.getByLabelText('Generated Lorem Ipsum text');
    const originalOutput = output.value;
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));

    expect(output).not.toHaveValue(originalOutput);
    expect(screen.getByRole('status')).toHaveTextContent('Generated a new Lorem Ipsum variation.');
  });

  it('copies output and reports clipboard success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<LoremIpsumTool />);

    const output = screen.getByLabelText('Generated Lorem Ipsum text');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy generated Lorem Ipsum' }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(output.value);
    expect(screen.getByRole('status')).toHaveTextContent('Lorem Ipsum copied to clipboard.');
  });

  it('reports clipboard failures', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<LoremIpsumTool />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy generated Lorem Ipsum' }));
      await Promise.resolve();
    });

    expect(screen.getByRole('status')).toHaveTextContent('Unable to copy Lorem Ipsum.');
  });
});
