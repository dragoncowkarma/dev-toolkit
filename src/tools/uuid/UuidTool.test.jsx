import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UuidTool from './UuidTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function getResults() {
  return within(screen.getByRole('list', { name: 'Generated UUIDs' })).getAllByRole(
    'listitem'
  );
}

describe('UuidTool generation', () => {
  it('generates five lowercase, hyphenated UUID v4 values by default', () => {
    render(<UuidTool />);

    const results = getResults();
    expect(results).toHaveLength(5);
    results.forEach((result) => {
      expect(within(result).getByText(/^[0-9a-f-]+$/)).toHaveTextContent(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });
    expect(screen.getByLabelText('Hyphens')).toBeChecked();
    expect(screen.getByLabelText('Uppercase')).not.toBeChecked();
  });

  it('generates the selected batch size when regenerated', () => {
    render(<UuidTool />);

    fireEvent.change(screen.getByLabelText('Batch size'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));

    expect(getResults()).toHaveLength(3);
    expect(screen.getByText('3 UUIDs generated')).toBeInTheDocument();
  });

  it('clamps the batch size to the supported range', () => {
    render(<UuidTool />);

    fireEvent.change(screen.getByLabelText('Batch size'), { target: { value: '101' } });
    expect(screen.getByLabelText('Batch size')).toHaveValue(100);

    fireEvent.change(screen.getByLabelText('Batch size'), { target: { value: '0' } });
    expect(screen.getByLabelText('Batch size')).toHaveValue(1);
  });

  it('regenerates the list as UUID v7 when selected', () => {
    render(<UuidTool />);

    const originalValues = getResults().map((result) => result.querySelector('code').textContent);
    fireEvent.click(screen.getByRole('button', { name: 'UUID v7' }));

    const nextValues = getResults().map((result) => result.querySelector('code').textContent);
    nextValues.forEach((uuid) => {
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });
    expect(nextValues).not.toEqual(originalValues);
    expect(screen.getByText(/time-ordered identifiers/i)).toBeInTheDocument();
  });
});

describe('UuidTool formatting', () => {
  it('applies uppercase, no-hyphen, and brace options without regenerating', () => {
    render(<UuidTool />);

    const original = getResults()[0].querySelector('code').textContent;
    fireEvent.click(screen.getByLabelText('Uppercase'));
    fireEvent.click(screen.getByLabelText('Hyphens'));
    fireEvent.click(screen.getByLabelText('Braces'));

    const formatted = getResults()[0].querySelector('code').textContent;
    expect(formatted).toBe(`{${original.replaceAll('-', '').toUpperCase()}}`);
  });
});

describe('UuidTool clipboard management', () => {
  it('copies one UUID and shows row-specific confirmation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<UuidTool />);

    const firstResult = getResults()[0];
    const firstUuid = firstResult.querySelector('code').textContent;
    await act(async () => {
      fireEvent.click(within(firstResult).getByRole('button', { name: 'Copy UUID 1' }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(firstUuid);
    expect(within(firstResult).getByRole('button', { name: 'UUID 1 copied' })).toHaveTextContent(
      'Copied'
    );
    expect(screen.getByRole('status')).toHaveTextContent('UUID 1 copied to clipboard.');
  });

  it('copies every formatted UUID separated by newlines', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<UuidTool />);

    fireEvent.click(screen.getByLabelText('Uppercase'));
    fireEvent.click(screen.getByLabelText('Braces'));

    const expected = getResults()
      .map((result) => result.querySelector('code').textContent)
      .join('\n');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy all UUIDs' }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(expected);
    expect(screen.getByRole('button', { name: 'All UUIDs copied' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('All UUIDs copied to clipboard.');
  });

  it('reports clipboard failures without removing generated values', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<UuidTool />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy all UUIDs' }));
      await Promise.resolve();
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to copy to clipboard.');
    expect(getResults()).toHaveLength(5);
  });
});

describe('UuidTool navigation', () => {
  it('invokes the optional back callback', () => {
    const onBack = vi.fn();
    render(<UuidTool onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
