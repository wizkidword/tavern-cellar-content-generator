import assert from "node:assert/strict";
import test from "node:test";

import {
  parseStringArray,
  parseWordPressCategoryIds,
  serializeStringArray,
  serializeWordPressCategoryIds,
} from "@/lib/serialized-values";

test("serializes and parses string arrays without trusting corrupt legacy JSON", () => {
  assert.equal(serializeStringArray(["  first ", "", "second"]), '["first","second"]');
  assert.deepEqual(parseStringArray('["first","second"]'), ["first", "second"]);
  assert.deepEqual(parseStringArray('["first",42]'), []);
  assert.deepEqual(parseStringArray("not JSON"), []);
});

test("normalizes WordPress category IDs and preserves readable legacy rows", () => {
  assert.equal(serializeWordPressCategoryIds([9, 2, 9, -1, 0]), "[2,9]");
  assert.deepEqual(parseWordPressCategoryIds("[9,2,9]"), [9, 2, 9]);
  assert.deepEqual(parseWordPressCategoryIds("9, 2 | 9"), [9, 2]);
  assert.deepEqual(parseWordPressCategoryIds('["9"]'), []);
});
