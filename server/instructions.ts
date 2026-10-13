import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";

const TODO_INSTRUCTIONS = `This workspace is tracked by the Todo Board plugin, which renders markdown checkbox items as a kanban board in Paseo.

When the user gives you tasks, work items, or follow-ups, record them in a markdown file in the workspace root — prefer TODO.md; create it with a "# TODO" heading if it does not exist, and use an existing file (such as AGENTS.md) if it already contains checkbox items.

Use these markers so the board reflects real status:
- [ ] todo — work not started
- [/] in progress — work you have started
- [x] done — completed work

Keep the markers current as you work: flip [ ] to [/] when you start an item and to [x] when you finish it. Group items under ## headings when the file has several areas of work.`;

function appendInstructions(existing: string | undefined | null): string {
  const trimmed = existing?.trim();
  return trimmed ? `${trimmed}\n\n${TODO_INSTRUCTIONS}` : TODO_INSTRUCTIONS;
}

async function scaffoldTodoFile(cwd: string): Promise<void> {
  const target = path.join(cwd, "TODO.md");
  const existing = await stat(target).catch(() => null);
  if (existing?.isFile()) return;
  await mkdir(cwd, { recursive: true });
  await writeFile(target, "# TODO\n", "utf8");
}

export function registerInstructionHooks(server: PluginServerContext): void {
  server.before("agent.create", ({ request }) => ({
    ...request,
    config: {
      ...request.config,
      systemPrompt: appendInstructions(request.config.systemPrompt),
    },
  }));
  server.on("workspace.created", ({ workspace }) => scaffoldTodoFile(workspace.cwd));
}
