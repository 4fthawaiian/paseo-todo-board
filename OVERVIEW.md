Todo Board turns the markdown todo lists already in a workspace into a kanban board. Each workspace gets a Todo Board panel that reads checkbox items from AGENTS.md, TODO.md, and other markdown files in the workspace directory and shows them as cards in Todo, In Progress, and Done columns.

The board is a live view of the files, not a separate database. Checking a card writes the checkbox marker back into the markdown file, and the panel refreshes from disk every few seconds, so edits made by agents or other tools show up automatically. New tasks are appended as `- [ ]` items to the first file that already has tasks, or to a new TODO.md.

## What it scans

- All `*.md` files at the workspace root
- Files named like todo, tasks, backlog, checklist, roadmap, notes, agents, claude, or contributing up to three directories deep
- Checkbox items in `- [ ]`, `- [x]`, `- [/]`, `- [~]`, and `- [>]` forms, grouped under their nearest markdown heading

It skips node_modules, hidden directories, build outputs, and task-looking lines inside fenced code blocks. Requires a workspace with a directory on the daemon host.
