import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Board, BoardFile, TaskCard } from "../shared/model";
import { parseTasks } from "./markdown";

const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "coverage",
  "vendor",
  ".paseo",
  ".dev",
]);

/** Filenames worth scanning at any depth. */
const NAMED_FILE_RE =
  /^(todo|todos|tasks?|backlog|checklist|roadmap|plan|plans|notes|agents|claude|gemini|copilot|contributing|changelog|doing|wip|scratch)(\.(md|markdown|txt))?$/i;

const PRIORITY = ["todo.md", "todo", "tasks.md", "agents.md", "claude.md"];

const MAX_DEPTH = 3;
const MAX_FILES = 24;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TASKS = 2000;

interface Candidate {
  relative: string;
  absolute: string;
}

function priorityRank(relative: string): number {
  const base = path.basename(relative).toLowerCase();
  const index = PRIORITY.indexOf(base);
  return index === -1 ? PRIORITY.length : index;
}

async function collect(dir: string): Promise<Candidate[]> {
  const found: Candidate[] = [];
  async function walk(current: string, depth: number): Promise<void> {
    if (found.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= MAX_FILES) return;
      const absolute = path.join(current, entry.name);
      const relative = path.relative(dir, absolute);
      if (entry.isDirectory()) {
        if (depth >= MAX_DEPTH) continue;
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith(".")) continue;
        await walk(absolute, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      if (depth === 0 ? /\.(md|markdown)$/.test(lower) || NAMED_FILE_RE.test(lower) : NAMED_FILE_RE.test(lower)) {
        found.push({ relative, absolute });
      }
    }
  }
  await walk(dir, 0);
  found.sort((a, b) => {
    const rank = priorityRank(a.relative) - priorityRank(b.relative);
    return rank !== 0 ? rank : a.relative.localeCompare(b.relative);
  });
  return found;
}

export interface ScanOutcome {
  files: BoardFile[];
  cards: TaskCard[];
  scannedFiles: number;
}

export async function scanWorkspace(dir: string, workspaceId: string): Promise<Board> {
  const candidates = await collect(dir);
  const cards: TaskCard[] = [];
  const files: BoardFile[] = [];
  let scanned = 0;
  for (const candidate of candidates) {
    if (cards.length >= MAX_TASKS) break;
    let info;
    try {
      info = await stat(candidate.absolute);
      if (!info.isFile() || info.size > MAX_FILE_BYTES || info.size === 0) continue;
    } catch {
      continue;
    }
    let content: string;
    try {
      content = await readFile(candidate.absolute, "utf8");
    } catch {
      continue;
    }
    scanned += 1;
    const tasks = parseTasks(content);
    if (tasks.length === 0) continue;
    files.push({ path: candidate.relative, mtimeMs: info.mtimeMs, taskCount: tasks.length });
    for (const task of tasks) {
      if (cards.length >= MAX_TASKS) break;
      cards.push({
        id: `${candidate.relative}:${task.line}`,
        title: task.title,
        state: task.state,
        file: candidate.relative,
        line: task.line,
        depth: task.depth,
        section: task.section,
        sourceLine: task.sourceLine,
      });
    }
  }
  return {
    workspaceId,
    directory: dir,
    generatedAt: new Date().toISOString(),
    files,
    scannedFiles: scanned,
    cards,
  };
}
