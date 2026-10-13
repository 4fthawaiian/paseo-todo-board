# paseo-todo-board

A [Paseo](https://paseo.sh) plugin that turns markdown todo lists into a kanban board for each workspace.

It scans the workspace directory for checkbox items in `AGENTS.md`, `TODO.md`, and other markdown files, and shows them as drag-and-drop cards in Todo / In Progress / Done columns inside a workspace panel. The markdown files stay the source of truth: moving a card flips its checkbox marker in the file, and the board refreshes from disk continuously.

## Features

- Workspace panel registered on every workspace, plus a workspace Command Center entry
- Drag and drop between columns; checkbox, Start/Back/Done/Reopen actions per card
- **Start** creates a Paseo agent in the workspace with the task as its prompt and moves the card to in progress
- `/todo <task>` slash command appends a task to the workspace's todo file
- New agents get a system-prompt note explaining the marker convention so they keep the board current as they work
- New workspaces get an empty TODO.md scaffolded
- Writes back atomically with conflict detection, so agent and human edits never silently clobber each other

## Install

```bash
paseo plugin install git:4fthawaiian/paseo-todo-board
```

or `npm:paseo-todo-board` once published to npm.

Requires Paseo >= 0.11.2. See [OVERVIEW.md](OVERVIEW.md) for the registry listing text.

## Development

```bash
npm install
npm run typecheck
npx vitest run
paseo plugin install /path/to/this/repo   # local install
paseo plugin reload todo-board            # after edits
```
