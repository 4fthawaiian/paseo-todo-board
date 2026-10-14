import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Board, TaskCard, TaskState } from "../shared/model";
import { addTaskRpc, setStateRpc, snapshotRpc } from "../shared/rpc";

const COLUMNS: { state: TaskState; title: string }[] = [
  { state: "todo", title: "Todo" },
  { state: "in_progress", title: "In Progress" },
  { state: "done", title: "Done" },
];

const COLUMN_MIN_WIDTH = 240;
const COLUMN_GAP = 12;

/**
 * Pick an agent provider in `provider/model` format. Prefers the provider+model
 * of the most recently active agent in this workspace (what the user actually
 * runs there), then the most recent agent anywhere, then the first ready
 * provider's default model.
 */
async function pickProvider(
  paseo: ReturnType<typeof usePaseo>,
  workspaceId: string,
): Promise<string> {
  const toProviderModel = (provider: string, model: string | null | undefined): string => {
    if (!model) return provider;
    return model.startsWith(`${provider}/`) ? model : `${provider}/${model}`;
  };
  const agents = await paseo.agents.list({ filter: { includeArchived: false } }).catch(() => null);
  const active = (agents?.entries ?? [])
    .map((entry) => entry.agent)
    .filter((agent) => agent.status !== "closed")
    .sort((a, b) => Date.parse(b.lastUserMessageAt ?? b.updatedAt) - Date.parse(a.lastUserMessageAt ?? a.updatedAt));
  const workspaceAgent = active.find((agent) => agent.workspaceId === workspaceId) ?? active[0];
  if (workspaceAgent) {
    return toProviderModel(workspaceAgent.provider, workspaceAgent.model);
  }
  const snapshot = await paseo.providers.snapshot();
  const entries = snapshot.compactSnapshot?.entries ?? snapshot.entries;
  const ready = entries.filter((entry) => entry.enabled && entry.status === "ready");
  for (const entry of ready) {
    const model = entry.models?.find((m) => m.isDefault && m.isSelectable !== false) ??
      entry.models?.find((m) => m.isSelectable !== false);
    if (model) return `${entry.provider}/${model.id}`;
    if (!entry.models || entry.models.length === 0) return entry.provider;
  }
  throw new Error("No ready provider with a selectable model");
}

export function BoardPanel({ theme, layout, workspaceId, navigation }: PluginWorkspacePanelProps) {
  const snapshot = useRpc(snapshotRpc);
  const setState = useRpc(setStateRpc);
  const addTask = useRpc(addTaskRpc);
  const paseo = usePaseo();
  const queryClient = useQueryClient();
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [startingTaskId, setStartingTaskId] = useState<string | null>(null);
  const dragCard = useRef<TaskCard | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskState | null>(null);
  const rootRef = useRef<View>(null);
  const rootOrigin = useRef({ x: 0, y: 0 });
  const columnViews = useRef(new Map<TaskState, View>());
  const columnRects = useRef(new Map<TaskState, { x: number; y: number; w: number; h: number }>());

  const queryKey = useMemo(() => ["todo-board", workspaceId] as const, [workspaceId]);
  const board = useQuery({
    queryKey,
    queryFn: () => snapshot({ workspaceId }),
    refetchInterval: 4000,
  });

  const colors = theme.colors;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.surface0 },
        header: {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 10,
          gap: 8,
        },
        headerTitle: { color: colors.foreground, fontSize: 15, fontWeight: "600", flex: 1, userSelect: "none" },
        headerMeta: { color: colors.foregroundMuted, fontSize: 12, userSelect: "none" },
        refresh: { color: colors.accent, fontSize: 16, paddingHorizontal: 6 },
        errorText: { color: colors.statusDanger, fontSize: 12, paddingHorizontal: 12 },
        columns: { flexDirection: "row", gap: COLUMN_GAP, padding: 12 },
        column: { backgroundColor: colors.surface1, borderRadius: 10, padding: 8 },
        columnDropTarget: { borderWidth: 2, borderColor: colors.accent, padding: 6 },
        columnHeader: {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 4,
          paddingBottom: 8,
          gap: 6,
        },
        columnTitle: { color: colors.foregroundMuted, fontSize: 12, fontWeight: "700", flex: 1, textTransform: "uppercase", userSelect: "none" },
        columnCount: { color: colors.foregroundMuted, fontSize: 12, userSelect: "none" },
        card: {
          backgroundColor: colors.surface2,
          borderRadius: 8,
          padding: 8,
          marginBottom: 6,
          flexDirection: "row",
          gap: 8,
          alignItems: "flex-start",
        },
        checkbox: {
          width: 18,
          height: 18,
          borderRadius: 4,
          borderWidth: 1.5,
          borderColor: colors.border,
          marginTop: 1,
          alignItems: "center",
          justifyContent: "center",
        },
        checkboxDone: { backgroundColor: colors.accent, borderColor: colors.accent },
        checkmark: { color: colors.accentForeground, fontSize: 11, fontWeight: "700", userSelect: "none" },
        cardBody: { flex: 1, gap: 4 },
        cardTitle: { color: colors.foreground, fontSize: 13, userSelect: "none" },
        cardTitleDone: { textDecorationLine: "line-through", color: colors.foregroundMuted },
        cardMeta: { color: colors.foregroundMuted, fontSize: 11, userSelect: "none" },
        cardActions: { flexDirection: "row", gap: 10, marginTop: 2 },
        cardAction: { color: colors.accent, fontSize: 12, fontWeight: "600", userSelect: "none" },
        handle: {
          paddingHorizontal: 4,
          paddingVertical: 2,
          alignSelf: "stretch",
          justifyContent: "center",
          // RN types only allow "auto"|"pointer"; RN-web passes any CSS cursor through.
          cursor: "grab" as "pointer",
        },
        handleGlyph: { color: colors.foregroundMuted, fontSize: 14, fontWeight: "700", userSelect: "none" },
        dragGhost: {
          position: "absolute",
          maxWidth: 240,
          backgroundColor: colors.surface2,
          borderRadius: 8,
          borderWidth: 1.5,
          borderColor: colors.accent,
          padding: 8,
          opacity: 0.92,
        },
        addRow: { flexDirection: "row", gap: 6, marginBottom: 8 },
        input: {
          flex: 1,
          backgroundColor: colors.surface2,
          borderRadius: 8,
          paddingHorizontal: 8,
          paddingVertical: 6,
          color: colors.foreground,
          fontSize: 13,
        },
        addButton: { justifyContent: "center", paddingHorizontal: 10 },
        addButtonText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
        empty: { padding: 16, gap: 6 },
        emptyText: { color: colors.foregroundMuted, fontSize: 13, userSelect: "none" },
        centered: { flex: 1, alignItems: "center", justifyContent: "center" },
      }),
    [colors],
  );

  const applyBoard = (next: Board) => {
    queryClient.setQueryData(queryKey, next);
    setMutationError(null);
  };
  const handleMutationError = (error: unknown) => {
    setMutationError(error instanceof Error ? error.message : String(error));
    void board.refetch();
  };

  const changeState = (card: TaskCard, state: TaskState) => {
    setState(
      {
        workspaceId,
        file: card.file,
        line: card.line,
        expectedSource: card.sourceLine,
        state,
      },
      )
      .then(applyBoard)
      .catch(handleMutationError);
  };

  const submitDraft = () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    addTask({ workspaceId, title }).then(applyBoard).catch(handleMutationError);
  };

  const columnAt = (x: number, y: number): TaskState | null => {
    for (const [state, rect] of columnRects.current) {
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        return state;
      }
    }
    return null;
  };

  const beginDrag = (card: TaskCard, x: number, y: number) => {
    // measure() reports pageX/pageY, the same document space as responder events.
    rootRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
      rootOrigin.current = { x: pageX, y: pageY };
    });
    for (const [state, view] of columnViews.current) {
      view.measure((_x, _y, w, h, pageX, pageY) => {
        columnRects.current.set(state, { x: pageX, y: pageY, w, h });
      });
    }
    dragCard.current = card;
    setDragPos({ x, y });
    setDropTarget(columnAt(x, y));
  };

  const moveDrag = (x: number, y: number) => {
    setDragPos({ x, y });
    setDropTarget(columnAt(x, y));
  };

  const endDrag = (x: number, y: number) => {
    const card = dragCard.current;
    const target = columnAt(x, y);
    dragCard.current = null;
    setDragPos(null);
    setDropTarget(null);
    if (card && target && target !== card.state) changeState(card, target);
  };

  const cancelDrag = () => {
    dragCard.current = null;
    setDragPos(null);
    setDropTarget(null);
  };

  const startWork = async (card: TaskCard) => {
    setStartingTaskId(card.id);
    setMutationError(null);
    try {
      const provider = await pickProvider(paseo, workspaceId);
      const prompt = [
        `Work on this task from ${card.file} (line ${card.line + 1}${card.section ? `, section "${card.section}"` : ""}):`,
        "",
        card.title,
        "",
        `When the task is done, mark it complete by changing its checkbox to [x] in ${card.file}.`,
      ].join("\n");
      const agent = await paseo.workspaces.ref(workspaceId).agents.create({
        config: { provider },
        title: card.title.slice(0, 60),
        prompt,
      });
      await setState(
        {
          workspaceId,
          file: card.file,
          line: card.line,
          expectedSource: card.sourceLine,
          state: "in_progress",
        },
      ).then(applyBoard);
      navigation?.openAgent({ agentId: agent.id });
    } catch (error) {
      handleMutationError(error);
    } finally {
      setStartingTaskId(null);
    }
  };

  if (board.isPending) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (board.isError || !board.data) {
    return (
      <View style={[styles.root, styles.centered]}>
        <Text style={styles.emptyText}>
          {board.error instanceof Error ? board.error.message : "Failed to load board"}
        </Text>
        <Pressable onPress={() => void board.refetch()}>
          <Text style={styles.cardAction}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const data = board.data;
  const columnWidth = Math.max(
    COLUMN_MIN_WIDTH,
    containerSize.width > 0
      ? (containerSize.width - 24 - COLUMN_GAP * (COLUMNS.length - 1)) / COLUMNS.length
      : COLUMN_MIN_WIDTH,
  );
  // Panel height minus header (~48px) and container padding.
  const columnHeight = Math.max(200, containerSize.height - 72);

  const renderCard = (card: TaskCard) => {
    const done = card.state === "done";
    return (
      <View key={card.id} style={[styles.card, { marginLeft: Math.min(card.depth, 3) * 12 }]}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={card.title}
          onPress={() => changeState(card, done ? "todo" : "done")}
          style={[styles.checkbox, done && styles.checkboxDone]}
        >
          {done && <Text style={styles.checkmark}>✓</Text>}
        </Pressable>
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, done && styles.cardTitleDone]}>{card.title}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {card.file}
            {card.section ? ` › ${card.section}` : ""}
          </Text>
          {startingTaskId === card.id ? (
            <ActivityIndicator color={colors.accent} style={{ alignSelf: "flex-start" }} />
          ) : (
            <View style={styles.cardActions}>
              {card.state === "todo" && (
                <Pressable onPress={() => void startWork(card)}>
                  <Text style={styles.cardAction}>Start</Text>
                </Pressable>
              )}
              {card.state === "in_progress" && (
                <Pressable onPress={() => changeState(card, "todo")}>
                  <Text style={styles.cardAction}>Back</Text>
                </Pressable>
              )}
              {!done && (
                <Pressable onPress={() => changeState(card, "done")}>
                  <Text style={styles.cardAction}>Done</Text>
                </Pressable>
              )}
              {done && (
                <Pressable onPress={() => changeState(card, "todo")}>
                  <Text style={styles.cardAction}>Reopen</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
        <View
          accessibilityLabel={`Drag ${card.title}`}
          onStartShouldSetResponder={() => true}
          onResponderGrant={(event) =>
            beginDrag(card, event.nativeEvent.pageX, event.nativeEvent.pageY)
          }
          onResponderMove={(event) =>
            moveDrag(event.nativeEvent.pageX, event.nativeEvent.pageY)
          }
          onResponderRelease={(event) =>
            endDrag(event.nativeEvent.pageX, event.nativeEvent.pageY)
          }
          onResponderTerminationRequest={() => false}
          onResponderTerminate={cancelDrag}
          hitSlop={8}
          style={styles.handle}
        >
          <Text style={styles.handleGlyph}>≡</Text>
        </View>
      </View>
    );
  };

  return (
    <View
      ref={rootRef}
      style={styles.root}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setContainerSize({ width, height });
      }}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Todo Board</Text>
        <Text style={styles.headerMeta}>
          {data.cards.length} task{data.cards.length === 1 ? "" : "s"} · {data.files.length} file
          {data.files.length === 1 ? "" : "s"}
        </Text>
        <Pressable accessibilityLabel="Refresh" onPress={() => void board.refetch()}>
          <Text style={styles.refresh}>↻</Text>
        </Pressable>
      </View>
      {mutationError && <Text style={styles.errorText}>{mutationError}</Text>}
      {data.directory === null ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>This workspace has no directory on this host.</Text>
        </View>
      ) : (
        <ScrollView horizontal={!layout.compact} style={{ flex: 1 }}>
          <View
            style={[
              styles.columns,
              layout.compact && { flexDirection: "column" },
            ]}
          >
            {COLUMNS.map((column) => {
              const cards = data.cards.filter((card) => card.state === column.state);
              return (
                <View
                  key={column.state}
                  ref={(view) => {
                    if (view) columnViews.current.set(column.state, view);
                    else columnViews.current.delete(column.state);
                  }}
                  style={[
                    styles.column,
                    layout.compact
                      ? { marginBottom: COLUMN_GAP }
                      : { width: columnWidth, height: columnHeight, alignSelf: "flex-start" },
                    dropTarget === column.state && styles.columnDropTarget,
                  ]}
                >
                  <View style={styles.columnHeader}>
                    <Text style={styles.columnTitle}>{column.title}</Text>
                    <Text style={styles.columnCount}>{cards.length}</Text>
                  </View>
                  {column.state === "todo" && (
                    <View style={styles.addRow}>
                      <TextInput
                        value={draft}
                        onChangeText={setDraft}
                        onSubmitEditing={submitDraft}
                        placeholder="Add a task…"
                        placeholderTextColor={colors.foregroundMuted}
                        style={styles.input}
                        returnKeyType="done"
                      />
                      <Pressable
                        accessibilityLabel="Add task"
                        onPress={submitDraft}
                        style={styles.addButton}
                      >
                        <Text style={styles.addButtonText}>Add</Text>
                      </Pressable>
                    </View>
                  )}
                  {layout.compact ? (
                    cards.map(renderCard)
                  ) : (
                    <ScrollView style={{ flex: 1 }}>{cards.map(renderCard)}</ScrollView>
                  )}
                  {column.state === "todo" && data.cards.length === 0 && (
                    <View style={styles.empty}>
                      <Text style={styles.emptyText}>
                        No markdown todos found in this workspace.
                      </Text>
                      <Text style={styles.emptyText}>
                        Scanned {data.scannedFiles} markdown file
                        {data.scannedFiles === 1 ? "" : "s"} — AGENTS.md, TODO.md, and other *.md
                        files. Add one above.
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
      {dragPos && dragCard.current && (
        <View
          pointerEvents="none"
          style={[
            styles.dragGhost,
            {
              left: dragPos.x - rootOrigin.current.x - 40,
              top: dragPos.y - rootOrigin.current.y - 16,
            },
          ]}
        >
          <Text numberOfLines={2} style={styles.cardTitle}>
            {dragCard.current.title}
          </Text>
        </View>
      )}
    </View>
  );
}
