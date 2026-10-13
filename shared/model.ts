import { z } from "zod";

export const taskStateSchema = z.enum(["todo", "in_progress", "done"]);
export type TaskState = z.infer<typeof taskStateSchema>;

export const taskCardSchema = z.object({
  /** Stable within a scan: `${file}:${line}`. */
  id: z.string(),
  title: z.string(),
  state: taskStateSchema,
  /** Workspace-relative markdown file path. */
  file: z.string(),
  /** 0-based line index of the checkbox item. */
  line: z.number(),
  /** Nesting depth derived from indentation. */
  depth: z.number(),
  /** Nearest preceding markdown heading, if any. */
  section: z.string().nullable(),
  /** Raw source line, used for optimistic-conflict detection on writes. */
  sourceLine: z.string(),
});
export type TaskCard = z.infer<typeof taskCardSchema>;

export const boardFileSchema = z.object({
  path: z.string(),
  mtimeMs: z.number(),
  taskCount: z.number(),
});
export type BoardFile = z.infer<typeof boardFileSchema>;

export const boardSchema = z.object({
  workspaceId: z.string(),
  /** Resolved workspace directory; null when the daemon can't provide one. */
  directory: z.string().nullable(),
  generatedAt: z.string(),
  /** Markdown files that contain at least one task item. */
  files: z.array(boardFileSchema),
  /** Number of markdown files inspected (including those with no tasks). */
  scannedFiles: z.number(),
  cards: z.array(taskCardSchema),
});
export type Board = z.infer<typeof boardSchema>;
