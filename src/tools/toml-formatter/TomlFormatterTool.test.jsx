import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import TomlFormatterTool from './TomlFormatterTool.jsx';

afterEach(cleanup);

describe('TomlFormatterTool', () => {
  it('renders normalized TOML as input changes', async () => {
    render(<TomlFormatterTool />);
    fireEvent.change(screen.getByLabelText('TOML input'), {
      target: { value: 'name="Ada"\nenabled=true' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Formatted TOML output')).toHaveValue(
        'name = "Ada"\nenabled = true\n',
      );
    });
  });

  it('shows the equivalent parsed structure in the JSON preview', async () => {
    render(<TomlFormatterTool />);
    fireEvent.change(screen.getByLabelText('TOML input'), {
      target: { value: '[project]\nname = "Dev Toolkit"' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'JSON Preview' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Parsed JSON preview')).toHaveValue(
        '{\n  "project": {\n    "name": "Dev Toolkit"\n  }\n}',
      );
    });
  });

  it('shows a non-crashing parse error with a source location', async () => {
    render(<TomlFormatterTool />);
    fireEvent.change(screen.getByLabelText('TOML input'), {
      target: { value: 'valid = true\nbroken = [1 2]' },
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('TOML input is invalid.');
    expect(alert).toHaveTextContent('Line 2, column');
  });
});
