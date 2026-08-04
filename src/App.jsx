import React from 'react';
import Layout from './components/Layout.jsx';
// Tools are discovered from disk, not registered by hand. Adding a tool means
// adding `src/tools/<slug>/meta.js` (+ `<Name>Tool.jsx` once implemented) —
// nothing here ever needs editing, so parallel tool PRs stop colliding on a
// shared registration line.
const metaModules = import.meta.glob('./tools/*/meta.js', { eager: true });
const componentLoaders = import.meta.glob('./tools/*/*Tool.jsx');

function toolDirOf(globPath) {
  return globPath.split('/')[2];
}

const TOOLS = Object.entries(metaModules)
  .map(([path, mod]) => {
    const dir = toolDirOf(path);
    const componentPath = Object.keys(componentLoaders).find(
      (p) => toolDirOf(p) === dir,
    );
    return {
      ...mod.default,
      component: componentPath
        ? React.lazy(componentLoaders[componentPath])
        : ToolPlaceholder,
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

function ToolPlaceholder({ tool }) {
  return (
    <section className="tool-placeholder" aria-labelledby={`${tool.id}-title`}>
      <div className="tool-placeholder__intro">
        <span className="tool-placeholder__icon" aria-hidden="true">
          {tool.icon}
        </span>
        <div>
          <p className="tool-placeholder__eyebrow">{tool.category}</p>
          <h2 id={`${tool.id}-title`}>{tool.name}</h2>
        </div>
      </div>

      <p className="tool-placeholder__description">{tool.description}</p>

      <div className="tool-placeholder__preview" aria-label="Tool status">
        <div>
          <p className="tool-placeholder__preview-label">Workspace status</p>
          <p className="tool-placeholder__preview-title">Ready for implementation</p>
        </div>
        <span className="tool-placeholder__status">
          <span aria-hidden="true" />
          Planned
        </span>
      </div>
    </section>
  );
}

/**
 * Renders the developer toolkit application.
 *
 * @returns {React.JSX.Element} The application root.
 */
export default function App() {
  return <Layout tools={TOOLS} defaultToolId="base64" />;
}
