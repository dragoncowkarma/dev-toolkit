import React from 'react';
import Layout from './components/Layout.jsx';
import SubnetCalculatorTool from './tools/subnet-calculator/SubnetCalculatorTool.jsx';
// Most tools are discovered from disk. Tools without metadata modules are
// registered below, preserving the existing registry while allowing central
// registration where a tool needs it.
const metaModules = import.meta.glob('./tools/*/meta.js', { eager: true });
const componentLoaders = import.meta.glob('./tools/*/*Tool.jsx');

const CENTRAL_TOOLS = [
  {
    id: 'subnet-calculator',
    name: 'Subnet Calculator',
    description: 'Calculate IPv4 CIDR ranges, masks, usable hosts, and address classification.',
    icon: '◫',
    category: 'Calculator',
    component: SubnetCalculatorTool,
  },
];

function toolDirOf(globPath) {
  return globPath.split('/')[2];
}

const TOOLS = [
  ...Object.entries(metaModules).map(([path, mod]) => {
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
  }),
  ...CENTRAL_TOOLS,
]
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
