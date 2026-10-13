import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { scanWorkspace } from "./scan";

const dirs: string[] = [];

async function fixture(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "todo-board-"));
  dirs.push(dir);
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(dir, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
  return dir;
}

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("scanWorkspace", () => {
  it("collects tasks from AGENTS.md, TODO.md and other root markdown", async () => {
    const dir = await fixture({
      "AGENTS.md": "# Agents\n- [ ] fix the bug\n",
      "TODO.md": "# Todo\n- [x] done thing\n",
      "notes.md": "- [/] in flight\n",
      "src/code.ts": "- [ ] not markdown\n",
    });
    const board = await scanWorkspace(dir, "ws-1");
    expect(board.files.map((f) => f.path)).toEqual(["TODO.md", "AGENTS.md", "notes.md"]);
    expect(board.cards).toHaveLength(3);
    expect(board.cards.map((c) => c.state)).toEqual(["done", "todo", "in_progress"]);
  });

  it("finds named todo files in subdirectories but skips ignored dirs", async () => {
    const dir = await fixture({
      "docs/TODO.md": "- [ ] document api\n",
      "node_modules/pkg/TODO.md": "- [ ] ignored\n",
      ".github/TODO.md": "- [ ] also ignored\n",
      "deep/nested/roadmap.md": "- [ ] ship it\n",
    });
    const board = await scanWorkspace(dir, "ws-1");
    expect(board.cards.map((c) => c.title)).toEqual(["document api", "ship it"]);
  });

  it("returns an empty board when nothing matches", async () => {
    const dir = await fixture({ "index.ts": "export {}\n" });
    const board = await scanWorkspace(dir, "ws-1");
    expect(board.cards).toHaveLength(0);
    expect(board.files).toHaveLength(0);
  });
});
