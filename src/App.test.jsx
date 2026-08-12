import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./components/Layout.jsx', () => ({
  default: vi.fn(() => <div data-testid="layout-stub" />),
}));

import Layout from './components/Layout.jsx';
import Sidebar from './components/Sidebar.jsx';
import { TOOL_CATEGORIES } from './components/sidebar.utils.js';
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
  it('passes the full TOOLS catalog, sorted by id, and the default tool id to Layout', () => {
    render(<App />);

    const props = Layout.mock.calls[0][0];
    expect(props.defaultToolId).toBe('base64');
    // Tools are auto-discovered from src/tools/*/meta.js and sorted by id, so
    // this can't hardcode the full id list without going stale every time a
    // tool is added — assert the sort invariant plus the known core set.
    const ids = props.tools.map((tool) => tool.id);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
    expect(ids).toEqual(
      expect.arrayContaining([
        'base64',
        'case-converter',
        'diff',
        'hash',
        'html-entity',
        'json',
        'jwt',
        'password',
        'regex',
        'url',
        'uuid',
      ]),
    );
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
    expect(placeholderTools.length).toBe(0);

    if (placeholderTools.length > 0) {
      const [firstComponent] = placeholderTools.map((tool) => tool.component);
      placeholderTools.forEach((tool) => {
        expect(tool.component).toBe(firstComponent);
      });

      const realTools = tools.filter((tool) => typeof tool.component !== 'function');
      realTools.forEach((tool) => {
        expect(tool.component).not.toBe(firstComponent);
      });
    }
  });
});

describe('Tool catalog auto-discovery contract', () => {
  const metaModules = import.meta.glob('./tools/*/meta.js', { eager: true });
  const componentLoaders = import.meta.glob('./tools/*/*Tool.jsx');

  const metaEntries = Object.entries(metaModules);
  const componentPaths = Object.keys(componentLoaders);

  function toolDirOf(path) {
    return path.split('/')[2];
  }

  it('discovers tool metadata modules dynamically without a hardcoded list', () => {
    expect(metaEntries.length).toBeGreaterThan(0);
  });

  it('asserts each metadata default export has non-empty string fields required by the app', () => {
    const requiredFields = ['id', 'name', 'description', 'icon', 'category'];

    metaEntries.forEach(([path, mod]) => {
      const metadata = mod.default;
      expect(metadata, `Module at ${path} must have a default export`).toBeDefined();
      expect(typeof metadata, `Default export at ${path} must be an object`).toBe('object');

      requiredFields.forEach((field) => {
        const val = metadata?.[field];
        expect(
          typeof val === 'string' && val.trim().length > 0,
          `Metadata field "${field}" in ${path} must be a non-empty string`,
        ).toBe(true);
      });
    });
  });

  it('asserts every metadata id is unique across all tools', () => {
    const ids = metaEntries.map(([, mod]) => mod.default?.id);
    const seen = new Set();
    const duplicates = ids.filter((id) => id && seen.size === seen.add(id).size);
    expect(duplicates, `Duplicate tool metadata IDs found: ${duplicates.join(', ')}`).toEqual([]);
  });

  it('asserts each metadata id matches its owning tool-directory slug', () => {
    metaEntries.forEach(([path, mod]) => {
      const dirSlug = toolDirOf(path);
      const metadataId = mod.default?.id;
      expect(
        metadataId,
        `Metadata ID "${metadataId}" in ${path} must match directory slug "${dirSlug}"`,
      ).toBe(dirSlug);
    });
  });

  it('asserts every metadata directory has exactly one *Tool.jsx implementation', () => {
    const componentsByDir = componentPaths.reduce((acc, p) => {
      const dir = toolDirOf(p);
      acc[dir] = (acc[dir] || []).concat(p);
      return acc;
    }, {});

    metaEntries.forEach(([path]) => {
      const dirSlug = toolDirOf(path);
      const components = componentsByDir[dirSlug] || [];
      expect(
        components.length,
        `Tool directory "${dirSlug}" must have exactly one discoverable *Tool.jsx implementation`,
      ).toBe(1);
    });
  });

  it('asserts every discoverable tool component directory has metadata', () => {
    const metaDirs = new Set(metaEntries.map(([path]) => toolDirOf(path)));
    const componentDirs = Array.from(
      new Set(componentPaths.map((path) => toolDirOf(path))),
    );

    componentDirs.forEach((dirSlug) => {
      expect(
        metaDirs.has(dirSlug),
        `Component directory "${dirSlug}" has a *Tool.jsx implementation but is missing meta.js`,
      ).toBe(true);
    });
  });

  it('verifies the current merged catalog has zero placeholder tools', () => {
    render(<App />);

    const { tools } = Layout.mock.calls[0][0];
    const placeholderTools = tools.filter((tool) => typeof tool.component === 'function');
    expect(placeholderTools.length, 'Catalog must contain zero placeholder tools').toBe(0);
  });

  it('asserts every metadata category belongs to the TOOL_CATEGORIES vocabulary', () => {
    // Without this invariant nothing rejects a new spelling, and the sidebar's
    // derived filter row silently splits one category across several buttons.
    metaEntries.forEach(([path, mod]) => {
      const category = mod.default?.category;
      expect(
        TOOL_CATEGORIES.includes(category),
        `Category "${category}" in ${path} is not in TOOL_CATEGORIES ` +
          `(allowed: ${TOOL_CATEGORIES.join(', ')})`,
      ).toBe(true);
    });
  });

  it('asserts TOOL_CATEGORIES entries never collide by case or a trailing "s"', () => {
    // Guards the constant itself against reintroducing the ambiguity it exists
    // to prevent: "Converter"/"Converters"/"converters" must stay impossible.
    const keyOf = (name) => name.toLowerCase().replace(/s$/, '');
    const seen = new Map();

    TOOL_CATEGORIES.forEach((name) => {
      const key = keyOf(name);
      expect(
        seen.has(key),
        `TOOL_CATEGORIES entries "${seen.get(key)}" and "${name}" differ only by case ` +
          'or a trailing "s"',
      ).toBe(false);
      seen.set(key, name);
    });
  });
});

describe('Sidebar category filter over the real catalog', () => {
  const metaModules = import.meta.glob('./tools/*/meta.js', { eager: true });
  const catalog = Object.values(metaModules)
    .map((mod) => mod.default)
    .sort((a, b) => a.id.localeCompare(b.id));

  function renderSidebar() {
    return render(
      <Sidebar
        tools={catalog}
        activeToolId="base64"
        isCollapsed={false}
        isMobileOpen={false}
        onSelectTool={() => {}}
        onToggleCollapse={() => {}}
        onCloseMobile={() => {}}
      />,
    );
  }

  function categoryGroup() {
    return screen.getByRole('group', { name: 'Filter tools by category' });
  }

  function listedToolNames() {
    const nav = screen.getByRole('navigation', { name: 'Tool list' });
    return within(nav)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('.sidebar__tool-name').textContent.trim());
  }

  function namesOfCategory(category) {
    return catalog.filter((tool) => tool.category === category).map((tool) => tool.name);
  }

  it('renders the All reset plus exactly one control per distinct catalog category', () => {
    renderSidebar();

    const labels = within(categoryGroup())
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent.trim());
    const categoryLabels = labels.filter((label) => label !== 'All categories');
    const distinctCategories = new Set(catalog.map((tool) => tool.category));

    expect(labels).toHaveLength(distinctCategories.size + 1);
    expect([...categoryLabels].sort()).toEqual([...distinctCategories].sort());
    categoryLabels.forEach((label) => {
      expect(TOOL_CATEGORIES, `Rendered category control "${label}"`).toContain(label);
    });
  });

  it('never renders two category controls that differ only by case or a trailing "s"', () => {
    renderSidebar();

    const categoryLabels = within(categoryGroup())
      .getAllByRole('button')
      .map((button) => button.textContent.trim())
      .filter((label) => label !== 'All');
    const collapsed = categoryLabels.map((label) => label.toLowerCase().replace(/s$/, ''));

    expect(new Set(collapsed).size, `Ambiguous category controls: ${categoryLabels.join(', ')}`)
      .toBe(categoryLabels.length);
  });

  it('lists every conversion tool under the single Converter control', () => {
    renderSidebar();

    fireEvent.click(within(categoryGroup()).getByRole('button', { name: 'Converter' }));

    const listed = listedToolNames();
    expect(listed).toEqual(namesOfCategory('Converter'));
    expect(listed).toEqual(
      expect.arrayContaining(
        ['base-converter', 'color', 'csv', 'curl-converter', 'timestamp', 'unit-converter'].map(
          (id) => catalog.find((tool) => tool.id === id).name,
        ),
      ),
    );
  });

  it('lists every text tool under the single Text control', () => {
    renderSidebar();

    fireEvent.click(within(categoryGroup()).getByRole('button', { name: 'Text' }));

    const listed = listedToolNames();
    expect(listed).toEqual(namesOfCategory('Text'));
    expect(listed).toEqual(
      expect.arrayContaining(
        ['string-escaper', 'unicode', 'word-counter'].map(
          (id) => catalog.find((tool) => tool.id === id).name,
        ),
      ),
    );
  });
});

