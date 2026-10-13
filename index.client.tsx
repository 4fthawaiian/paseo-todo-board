import type { PluginClientContext } from "@getpaseo/plugin/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BoardPanel } from "./client/BoardPanel";
import { addTaskRpc } from "./shared/rpc";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1_500 } },
});

const Panel = (props: Parameters<typeof BoardPanel>[0]) => (
  <QueryClientProvider client={queryClient}>
    <BoardPanel {...props} />
  </QueryClientProvider>
);

export default function contribute(client: PluginClientContext) {
  const removePanel = client.addWorkspacePanel({
    id: "todo-board",
    title: "Todo Board",
    icon: "ListTodo",
    context: "workspace",
    locations: ["workspace"],
    Component: Panel,
  });
  const removeCommand = client.addCommandCenterItem({
    id: "todo-board-open",
    title: "Todo Board",
    icon: "ListTodo",
    keywords: ["todo", "kanban", "tasks", "board", "checklist"],
    context: "workspace",
    onSelect: (context) => context.openPanel("todo-board"),
  });
  const removeSlash = client.addSlashCommand({
    name: "todo",
    description: "Add a task to this workspace's todo file",
    argumentHint: "<task title>",
    context: "workspace",
    onSubmit: async (context) => {
      const title = context.args.trim();
      if (!title) {
        context.openPanel("todo-board");
        return;
      }
      await context.rpc(addTaskRpc, { workspaceId: context.workspace.id, title });
    },
  });
  return () => {
    removeSlash();
    removeCommand();
    removePanel();
  };
}
