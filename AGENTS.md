## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

The project-scoped Codex skill is in `.codex/skills/graphify/SKILL.md`. Invoke it with `$graphify` in Codex.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `npm run graphify:update` to refresh the graph, report and visualization together (local AST only, no API cost).

Project defaults:
- Install the pinned CLI with `npm run graphify:setup` (requires uv and Python 3.10+), or `pipx install 'graphifyy[sql]==0.9.22'`.
- Build with `npm run graphify:build`. Keep `--code-only` and `--no-label` for normal repo indexing; do not switch to hosted semantic extraction unless requested.
- Respect `.graphifyignore`; never include environment files, private exports, dependencies or generated artifacts.
- Generated `graphify-out/` files are ignored by Git and must be rebuilt in each checkout. Source code remains authoritative; graph output does not replace permission checks or tests.
- Do not use emoji in the application.
