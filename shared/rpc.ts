import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { boardSchema, taskStateSchema } from "./model";

export const snapshotRpc = defineRpc({
  name: "todo-board.snapshot",
  input: z.object({ workspaceId: z.string() }),
  output: boardSchema,
});

export const setStateRpc = defineRpc({
  name: "todo-board.set-state",
  input: z.object({
    workspaceId: z.string(),
    file: z.string(),
    line: z.number().int().nonnegative(),
    /** Raw line content the client last saw; mismatch means the file changed. */
    expectedSource: z.string(),
    state: taskStateSchema,
  }),
  output: boardSchema,
});

export const addTaskRpc = defineRpc({
  name: "todo-board.add-task",
  input: z.object({
    workspaceId: z.string(),
    title: z.string().trim().min(1).max(500),
    /** Optional workspace-relative target file; defaults to the first file that already has tasks, else TODO.md. */
    file: z.string().optional(),
  }),
  output: boardSchema,
});
