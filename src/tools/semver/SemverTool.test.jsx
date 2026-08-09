import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SemverTool from './SemverTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SemverTool Component', () => {
  it('recomputes comparison and breakdown in real time on input change', async () => {
    render(<SemverTool />);

    const inputA = screen.getByLabelText('Version A input');
    const inputB = screen.getByLabelText('Version B input');

    fireEvent.change(inputA, { target: { value: '2.0.0' } });
    fireEvent.change(inputB, { target: { value: '1.9.9' } });

    await waitFor(() => {
      expect(screen.getByText('2.0.0 > 1.9.9')).toBeInTheDocument();
      expect(screen.getByText('Diff: major')).toBeInTheDocument();
    });
  });

  it('updates range-check satisfied and not-satisfied states in real time', async () => {
    render(<SemverTool />);

    const targetInput = screen.getByLabelText('Range target version input');
    const rangeInput = screen.getByLabelText('Semver range input');

    fireEvent.change(targetInput, { target: { value: '1.5.0' } });
    fireEvent.change(rangeInput, { target: { value: '^1.2.0' } });

    await waitFor(() => {
      expect(screen.getByText('✓ Version satisfies range')).toBeInTheDocument();
    });

    fireEvent.change(targetInput, { target: { value: '2.0.0' } });

    await waitFor(() => {
      expect(screen.getByText('✕ Version does not satisfy range')).toBeInTheDocument();
    });
  });

  it('displays unsupported range state when parseRange returns null', async () => {
    render(<SemverTool />);

    const rangeInput = screen.getByLabelText('Semver range input');

    fireEvent.change(rangeInput, { target: { value: 'invalid syntax >> 1.2' } });

    await waitFor(() => {
      expect(screen.getByText('⚠️ Unsupported range syntax')).toBeInTheDocument();
    });
  });

  it('calculates bumped version output on release type change', async () => {
    render(<SemverTool />);

    const bumpVersionInput = screen.getByLabelText('Bump base version input');
    const releaseTypeSelect = screen.getByLabelText('Bump release type selector');

    fireEvent.change(bumpVersionInput, { target: { value: '1.2.3' } });
    fireEvent.change(releaseTypeSelect, { target: { value: 'major' } });

    await waitFor(() => {
      expect(screen.getByText('2.0.0')).toBeInTheDocument();
    });
  });

  it('handles copy-to-clipboard success feedback via aria-live region', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<SemverTool />);

    const copyButton = screen.getByRole('button', { name: 'Copy bumped version' });

    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(writeText).toHaveBeenCalledWith('1.3.0');
    expect(screen.getByRole('status')).toHaveTextContent('Copied bumped version to clipboard!');
  });

  it('handles copy-to-clipboard failure feedback via aria-live region', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard failure'));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<SemverTool />);

    const copyButton = screen.getByRole('button', { name: 'Copy bumped version' });

    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(writeText).toHaveBeenCalledWith('1.3.0');
    expect(screen.getByRole('status')).toHaveTextContent('Failed to copy version to clipboard.');
  });
});
