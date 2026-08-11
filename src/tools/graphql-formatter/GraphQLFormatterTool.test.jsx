import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GraphQLFormatterTool from './GraphQLFormatterTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function changeInput(value) {
  fireEvent.change(screen.getByLabelText('GraphQL input'), { target: { value } });
}

describe('GraphQLFormatterTool', () => {
  it('formats input live and changes indentation', async () => {
    const formattedOutput = 'query {\n  viewer {\n    id\n  }\n}';
    const fourSpaceOutput = 'query {\n    viewer {\n        id\n    }\n}';
    render(<GraphQLFormatterTool />);
    changeInput('query{viewer{id}}');
    await waitFor(() => {
      expect(screen.getByLabelText('Formatted GraphQL')).toHaveValue(formattedOutput);
    });
    fireEvent.change(screen.getByLabelText('Indent width'), { target: { value: '4' } });
    expect(screen.getByLabelText('Formatted GraphQL')).toHaveValue(fourSpaceOutput);
  });

  it('switches mode and exposes minified output', async () => {
    render(<GraphQLFormatterTool />);
    changeInput('query { viewer { id } }');
    fireEvent.change(screen.getByLabelText('Formatter mode'), { target: { value: 'minify' } });
    await waitFor(() => {
      expect(screen.getByLabelText('Minified GraphQL')).toHaveValue('query{viewer{id}}');
    });
    expect(screen.getByLabelText('Indent width')).toBeDisabled();
  });

  it('shows an inline error rather than throwing for invalid input', async () => {
    render(<GraphQLFormatterTool />);
    changeInput('query { viewer');
    expect(await screen.findByRole('alert')).toHaveTextContent(/unclosed/i);
  });

  it('copies the current output', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<GraphQLFormatterTool />);
    changeInput('query{viewer{id}}');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy output to clipboard' }));
    });
    expect(writeText).toHaveBeenCalledWith('query {\n  viewer {\n    id\n  }\n}');
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard.');
  });
});
