# Dev Toolkit ⚡

> All-in-One Developer Tools — built autonomously by an AI swarm.

A curated collection of essential developer utilities, deployed as a static site via GitHub Pages.

## 🛠 Available Tools

| Tool | Description | Status |
|------|-------------|--------|
| Base64 | Encode & Decode Base64 strings | ✅ Completed |
| JSON Formatter | Format, validate & minify JSON | ✅ Completed |
| URL Encoder | Encode & Decode URL strings | 🚧 Planned |
| Hash Generator | Generate MD5, SHA-1, SHA-256 hashes | 🚧 Planned |
| Regex Tester | Test & debug regular expressions | 🚧 Planned |
| Text Diff | Compare two texts side by side | 🚧 Planned |

## 🤖 Autonomous AI Swarm

This project is developed by an autonomous multi-agent swarm. See [AGENTS.md](./AGENTS.md) for the complete governance and workflow rules.

The orchestrator advances work only after a new lifecycle signal and records
each dispatch persistently, preventing duplicate AI processes across polling
cycles and restarts. A crashed process is retried up to 3 times for the same
event, so one transient CLI failure does not stall the swarm.

```bash
python3 .agents/workflows/test_swarm_orchestrator.py
python3 .agents/workflows/swarm_orchestrator.py --status
```

## 🚀 Development

Install the dependencies and start the Vite development server:

```bash
npm install
npm run dev
```

Run the test suite:

```bash
npm test
```

Create a production build before submitting changes:

```bash
npm run build
```

## 🏗 Architecture

The application is a React single-page app built with Vite. `App.jsx` registers the available
tools, while the shared layout and navigation render the selected tool. Each tool keeps its UI,
logic, styles, and tests together in its own directory.

```text
src/
├── main.jsx                 # React entry point
├── App.jsx                  # Tool registry and root application
├── index.css                # Global styles and design tokens
├── components/              # Shared layout and navigation
└── tools/
    ├── base64/              # Base64 UI, utilities, styles, and tests
    └── json/                # JSON formatter UI, utilities, styles, and tests
```

### Adding a Tool

1. Create a self-contained directory at `src/tools/<tool-name>/`.
2. Add the tool component, utility module, styles, and unit tests.
3. Import the component and add its metadata to the `TOOLS` registry in `src/App.jsx`.
4. Run `npm test` and `npm run build`.

## 🤝 Contributing

Development follows the autonomous multi-agent workflow defined in
[AGENTS.md](./AGENTS.md). Read it and the rules in [`.agents/rules/`](./.agents/rules/) before
starting. All changes must use an isolated worktree and follow the documented
Issue → PR → review → merge process, including distinct Worker, Reviewer, and
Maintainer roles.

## 📦 Deploy

```bash
npm run deploy
```

## License

MIT
