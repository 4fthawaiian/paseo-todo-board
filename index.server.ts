import type { PluginServerContext } from "@getpaseo/plugin/server";
import { addTask, setTaskState, snapshotBoard } from "./server/actions";
import { registerInstructionHooks } from "./server/instructions";
import { addTaskRpc, setStateRpc, snapshotRpc } from "./shared/rpc";

export default function contribute(server: PluginServerContext) {
  registerInstructionHooks(server);
  server.handle(snapshotRpc, (input, context) =>
    snapshotBoard(context.paseo, input.workspaceId),
  );
  server.handle(setStateRpc, (input, context) => setTaskState(context.paseo, input));
  server.handle(addTaskRpc, (input, context) => addTask(context.paseo, input));
  return () => {};
}
