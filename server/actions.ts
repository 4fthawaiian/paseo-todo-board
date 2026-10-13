import { readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { z } from "zod";
import type { Board } from "../shared/model";
import type { addTaskRpc, setStateRpc } from "../shared/rpc";
import { withMarker } from "./markdown";
import { scanWorkspace } from "./scan";

type PaseoApi = PluginHandlerContext["paseo"];
type SetStateInput = z.infer<typeof setStateRpc.input>;
type AddTaskInput = z.infer<typeof addTaskRpc.input>;

export async function workspaceDirectory(
  paseo: PaseoApi,
  workspaceId: string,
): Promise<string | null> {
  const workspace = await paseo.workspaces.ref(workspaceId).refresh();
  return workspace?.workspaceDirectory ?? workspace?.projectRootPath ?? null;
}

/** Resolve a workspace-relative path and reject escapes outside the workspace. */
export function resolveInside(dir: string, relative: string): string {
  const absolute = path.resolve(dir, relative);
  const root = path.resolve(dir);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new Error(`Path escapes workspace: ${relative}`);
  }
  return absolute;
}

async function writeAtomic(absolute: string, content: string): Promise<void> {
  const temp = `${absolute}.todo-board-${process.pid}.tmp`;
  await writeFile(temp, content, "utf8");
  await rename(temp, absolute);
}

export async function snapshotBoard(
  paseo: PaseoApi,
  workspaceId: string,
): Promise<Board> {
  const directory = await workspaceDirectory(paseo, workspaceId);
  if (!directory) {
    return {
      workspaceId,
      directory: null,
      generatedAt: new Date().toISOString(),
      files: [],
      scannedFiles: 0,
      cards: [],
    };
  }
  return scanWorkspace(directory, workspaceId);
}

export async function setTaskState(paseo: PaseoApi, input: SetStateInput): Promise<Board> {
  const directory = await workspaceDirectory(paseo, input.workspaceId);
  if (!directory) throw new Error("Workspace directory is unavailable");
  const absolute = resolveInside(directory, input.file);
  const content = await readFile(absolute, "utf8");
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split("\n");
  const current = lines[input.line];
  if (current === undefined || current.replace(/\r$/, "") !== input.expectedSource) {
    throw new Error("Task changed on disk; board refreshed");
  }
  const updated = withMarker(current.replace(/\r$/, ""), input.state);
  if (updated === null) throw new Error("Line is no longer a task item; board refreshed");
  lines[input.line] = updated + (current.endsWith("\r") ? "\r" : "");
  await writeAtomic(absolute, lines.join("\n"));
  return scanWorkspace(directory, input.workspaceId);
}

export async function addTask(paseo: PaseoApi, input: AddTaskInput): Promise<Board> {
  const directory = await workspaceDirectory(paseo, input.workspaceId);
  if (!directory) throw new Error("Workspace directory is unavailable");
  const board = await scanWorkspace(directory, input.workspaceId);
  const target = input.file ?? board.files[0]?.path ?? "TODO.md";
  const absolute = resolveInside(directory, target);
  const title = input.title.replace(/[\r\n]+/g, " ").trim();
  if (title.length === 0) throw new Error("Task title is empty");

  let content: string;
  try {
    const info = await stat(absolute);
    content = info.isFile() ? await readFile(absolute, "utf8") : "";
  } catch {
    content = "";
  }
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  if (content.length === 0) {
    const heading = path.basename(target).replace(/\.[^.]*$/, "").toUpperCase() || "TODO";
    content = `# ${heading}${newline}${newline}`;
  }
  const separator = content.endsWith(newline) || content.endsWith("\n") ? "" : newline;
  await writeAtomic(absolute, `${content}${separator}- [ ] ${title}${newline}`);
  return scanWorkspace(directory, input.workspaceId);
}
