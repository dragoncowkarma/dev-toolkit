import React from 'react';

const TOOLS = [
  { id: 'base64', name: 'Base64', desc: 'Encode & Decode Base64 strings', icon: '🔐', status: 'planned' },
  { id: 'json', name: 'JSON Formatter', desc: 'Format, validate & minify JSON', icon: '📋', status: 'planned' },
  { id: 'url', name: 'URL Encoder', desc: 'Encode & Decode URL strings', icon: '🔗', status: 'planned' },
  { id: 'hash', name: 'Hash Generator', desc: 'Generate MD5, SHA-1, SHA-256 hashes', icon: '🔑', status: 'planned' },
  { id: 'regex', name: 'Regex Tester', desc: 'Test & debug regular expressions', icon: '🧪', status: 'planned' },
  { id: 'diff', name: 'Text Diff', desc: 'Compare two texts side by side', icon: '📝', status: 'planned' },
];

function ToolCard({ tool }) {
  return (
    <div className="tool-card">
      <div className="tool-icon">{tool.icon}</div>
      <h3 className="tool-name">{tool.name}</h3>
      <p className="tool-desc">{tool.desc}</p>
      <span className={`tool-status status-${tool.status}`}>
        {tool.status === 'planned' ? '🚧 Coming Soon' : '✅ Available'}
      </span>
    </div>
  );
}

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <span className="logo-icon">⚡</span>
            <h1>Dev Toolkit</h1>
          </div>
          <p className="tagline">All-in-One Developer Tools</p>
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <h2>Essential utilities, always at hand.</h2>
          <p>A curated collection of developer tools built by an autonomous AI swarm.</p>
        </section>

        <section className="tools-grid">
          {TOOLS.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </section>
      </main>

      <footer className="footer">
        <p>Built autonomously by the AI Swarm 🤖 &middot; <a href="https://github.com/dragoncowkarma/dev-toolkit" target="_blank" rel="noopener noreferrer">GitHub</a></p>
      </footer>
    </div>
  );
}
