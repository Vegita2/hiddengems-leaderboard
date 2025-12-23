# Repository Guidelines

## Project Structure & Module Organization

- `index.html`, `matrix.html`, `chart.html`: static entry points for daily table, rank matrix, and rank chart views.
- `assets/`: page scripts and styles (`assets/app.js`, `assets/matrix.js`, `assets/chart.js`, plus `*.css`).
- `json/`: leaderbot and bot datasets loaded at runtime.
- `types/`: TypeScript schemas that document the data shape.

## Build, Test, and Development Commands

- `python -m http.server 4200` — serve this folder so `fetch("./data.json")` succeeds; open `http://localhost:4200/`.
- No build step or bundler; refresh the browser to see changes.

## Coding Style & Naming Conventions

- use tab indentation.
- Keep DOM selectors near the top and prefer small helper functions for formatting and safety.
- Use descriptive JSON keys and ISO date strings (`YYYY-MM-DD`) to preserve lexicographic sorting.

## Testing Guidelines

- Manual checks: load each page via the local server and confirm the table, matrix, and chart render properly.

## Data & Dependency Notes

- UI relies on CDN assets (Bootstrap, DataTables, Chart.js). Avoid changes that require a local build pipeline.
- Validate jsons against `types/types.ts` when adjusting the data format.
- Files in the folders `json/` and `types/` are not allowed to be changed except when explicitly approved by the project maintainers.
