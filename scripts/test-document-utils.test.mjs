import test from "node:test";
import assert from "node:assert/strict";
import { dedupeById, sortByActivityDesc } from "./lib/document-utils.mjs";

test("deduplication keeps the last value at the first key position", () => {
  const items = [{ id: "a", value: 1 }, { id: "b" }, { id: "a", value: 2 }, { value: 3 }, { value: 4 }];
  assert.deepEqual(dedupeById(items, (item) => item.id), [items[2], items[1], items[4]]);
  assert.deepEqual(dedupeById([], (item) => item.id), []);
});

test("activity comparator orders recent records first and retains ties", () => {
  const items = [{ lastActivityDate: "2025-01-01", id: 1 }, { lastActivityDate: "2025-02-01", id: 2 }, { lastActivityDate: "2025-02-01", id: 3 }];
  assert.deepEqual([...items].sort(sortByActivityDesc).map((item) => item.id), [2, 3, 1]);
});

