import { describe, expect, it } from "vitest";
import { parseTasks, withMarker } from "./markdown";

describe("parseTasks", () => {
  it("parses task states and tracks sections", () => {
    const content = [
      "# Project",
      "",
      "## Setup",
      "- [ ] install deps",
      "- [x] init repo",
      "- [/] running build",
      "",
      "## Later",
      "  - [~] nested task",
    ].join("\n");
    const tasks = parseTasks(content);
    expect(tasks).toHaveLength(4);
    expect(tasks[0]).toMatchObject({ title: "install deps", state: "todo", section: "Setup" });
    expect(tasks[1].state).toBe("done");
    expect(tasks[2].state).toBe("in_progress");
    expect(tasks[3]).toMatchObject({ state: "in_progress", depth: 1, section: "Later" });
  });

  it("ignores task-looking lines inside fenced code blocks", () => {
    const content = ["```md", "- [ ] not a task", "```", "", "- [ ] real task"].join("\n");
    const tasks = parseTasks(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("real task");
  });

  it("strips markdown links and emphasis from titles", () => {
    const tasks = parseTasks("- [ ] read [the docs](https://x.test) and **bold** words");
    expect(tasks[0].title).toBe("read the docs and bold words");
  });

  it("handles numbered and star bullets", () => {
    const tasks = parseTasks("1. [ ] first\n* [X] second");
    expect(tasks.map((t) => t.state)).toEqual(["todo", "done"]);
  });
});

describe("withMarker", () => {
  it("flips markers in place", () => {
    expect(withMarker("- [ ] task", "done")).toBe("- [x] task");
    expect(withMarker("  - [x] task", "todo")).toBe("  - [ ] task");
    expect(withMarker("- [ ] task", "in_progress")).toBe("- [/] task");
  });
  it("returns null for non-task lines", () => {
    expect(withMarker("- plain bullet", "done")).toBeNull();
    expect(withMarker("[link](url)", "done")).toBeNull();
  });
});
