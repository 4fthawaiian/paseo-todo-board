import type { TaskState } from "../shared/model";

const TASK_RE = /^(\s*)(?:[-*+]|\d{1,9}[.)])\s+\[([ xX/~>-])\]\s*(.*)$/;
const HEADING_RE = /^#{1,6}\s+(.+?)\s*#*\s*$/;
const FENCE_RE = /^\s*(```+|~~~+)/;
const TRAILING_COMMENT_RE = /\s*<!--.*?-->\s*$/;

export interface ParsedTask {
  title: string;
  state: TaskState;
  line: number;
  depth: number;
  section: string | null;
  sourceLine: string;
}

function markerToState(marker: string): TaskState {
  if (marker === " ") return "todo";
  if (marker === "/" || marker === "~" || marker === ">") return "in_progress";
  return "done";
}

export function stateToMarker(state: TaskState): string {
  if (state === "in_progress") return "/";
  if (state === "done") return "x";
  return " ";
}

function indentDepth(indent: string): number {
  let columns = 0;
  for (const char of indent) columns += char === "\t" ? 2 : 1;
  return Math.min(Math.floor(columns / 2), 8);
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/(?<!\w)\*([^*]*)\*(?!\w)/g, "$1")
    .replace(/~~([^~]*)~~/g, "$1")
    .trim();
}

export function parseTasks(content: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  let section: string | null = null;
  let fence: string | null = null;
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\r$/, "");
    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1].slice(0, 3);
      fence = fence === marker ? null : fence ?? marker;
      continue;
    }
    if (fence) continue;
    const taskMatch = TASK_RE.exec(line);
    if (taskMatch) {
      const title = stripInlineMarkdown(taskMatch[3].replace(TRAILING_COMMENT_RE, ""));
      if (title.length === 0) continue;
      tasks.push({
        title,
        state: markerToState(taskMatch[2]),
        line: index,
        depth: indentDepth(taskMatch[1]),
        section,
        sourceLine: line,
      });
      continue;
    }
    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) section = stripInlineMarkdown(headingMatch[1]);
  }
  return tasks;
}

/** Replace the checkbox marker inside a task line; returns null when the line isn't a task item. */
export function withMarker(line: string, state: TaskState): string | null {
  const bracket = line.indexOf("[");
  if (bracket < 0) return null;
  const marker = line[bracket + 1];
  if (marker === undefined || line[bracket + 2] !== "]") return null;
  if (!/^[ xX/~>-]$/.test(marker)) return null;
  if (!TASK_RE.test(line)) return null;
  return `${line.slice(0, bracket + 1)}${stateToMarker(state)}${line.slice(bracket + 2)}`;
}
