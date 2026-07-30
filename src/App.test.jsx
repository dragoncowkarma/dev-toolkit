import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./components/Layout.jsx', () => ({
  default: vi.fn(() => <div data-testid="layout-stub" />),
}));

import Layout from './components/Layout.jsx';
import App from './App.jsx';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('App mounting', () => {
  it('mounts without crashing and renders the Layout shell', () => {
    const { getByTestId } = render(<App />);
    expect(getByTestId('layout-stub')).toBeInTheDocument();
    expect(Layout).toHaveBeenCalledTimes(1);
  });
});

describe('App tool catalog wiring', () => {
  it('passes the full TOOLS catalog and default tool id to Layout', () => {
    render(<App />);

    const props = Layout.mock.calls[0][0];
    expect(props.defaultToolId).toBe('base64');
    expect(props.tools.map((tool) => tool.id)).toEqual([
      'base64',
      'json',
      'url',
      'hash',
      'regex',
      'diff',
    ]);
  });

  it('gives every tool a complete definition shape', () => {
    render(<App />);

    const { tools } = Layout.mock.calls[0][0];
    tools.forEach((tool) => {
      expect(tool).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          description: expect.any(String),
          icon: expect.any(String),
          category: expect.any(String),
          component: expect.any(Function),
        }),
      );
    });
  });

  it('wires distinct components for tools that have real implementations', () => {
    render(<App />);

    const { tools } = Layout.mock.calls[0][0];
    const byId = Object.fromEntries(tools.map((tool) => [tool.id, tool]));
    expect(byId.base64.component).not.toBe(byId.json.component);
    expect(byId.hash.component).not.toBe(byId.json.component);
    expect(byId.hash.component).not.toBe(byId.base64.component);
  });

  it('falls back placeholder tools onto the same shared component', () => {
    render(<App />);

    const { tools } = Layout.mock.calls[0][0];
    const placeholderTools = tools.filter((tool) =>
      ['url', 'regex', 'diff'].includes(tool.id),
    );
    const [firstComponent] = placeholderTools.map((tool) => tool.component);
    placeholderTools.forEach((tool) => {
      expect(tool.component).toBe(firstComponent);
    });

    const byId = Object.fromEntries(tools.map((tool) => [tool.id, tool]));
    expect(byId.hash.component).not.toBe(firstComponent);
  });
});
