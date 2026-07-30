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
      'jwt',
      'url',
      'html-entity',
      'hash',
      'uuid',
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
        }),
      );
      // Real tools are React.lazy() objects; placeholders are plain functions.
      expect(['function', 'object']).toContain(typeof tool.component);
      expect(tool.component).toBeTruthy();
    });
  });

  it('wires distinct components for tools that have real implementations', () => {
    render(<App />);

    const { tools } = Layout.mock.calls[0][0];
    // Real tools are React.lazy() objects; placeholders are plain functions.
    const realTools = tools.filter((tool) => typeof tool.component !== 'function');
    const components = realTools.map((tool) => tool.component);
    expect(new Set(components).size).toBe(components.length);
  });

  it('falls back placeholder tools onto the same shared component', () => {
    render(<App />);

    const { tools } = Layout.mock.calls[0][0];
    // Placeholders are plain functions; real tools are React.lazy() objects.
    const placeholderTools = tools.filter((tool) => typeof tool.component === 'function');
    expect(placeholderTools.length).toBeGreaterThan(0);

    const [firstComponent] = placeholderTools.map((tool) => tool.component);
    placeholderTools.forEach((tool) => {
      expect(tool.component).toBe(firstComponent);
    });

    const realTools = tools.filter((tool) => typeof tool.component !== 'function');
    realTools.forEach((tool) => {
      expect(tool.component).not.toBe(firstComponent);
    });
  });
});
