import test from "node:test";
import assert from "node:assert/strict";

import {
  isActiveAppCategory,
  isAllowedAppCategorySlug,
} from "@/lib/category-config";

test("keeps the original Tavern category slugs active", () => {
  assert.equal(isAllowedAppCategorySlug("horror"), true);
  assert.equal(isActiveAppCategory({ slug: "horror", isActive: false }), true);
  assert.equal(isAllowedAppCategorySlug("games"), true);
  assert.equal(isActiveAppCategory({ slug: "games", isActive: false }), true);
  assert.equal(isAllowedAppCategorySlug("the-game-of-thrones-universe"), true);
  assert.equal(
    isActiveAppCategory({
      slug: "the-game-of-thrones-universe",
      isActive: false,
    }),
    true,
  );
});

test("allows locally activated categories outside the original slug list", () => {
  assert.equal(isAllowedAppCategorySlug("tabletop-games"), false);
  assert.equal(isActiveAppCategory({ slug: "tabletop-games", isActive: true }), true);
  assert.equal(isActiveAppCategory({ slug: "uncategorized", isActive: false }), false);
});
