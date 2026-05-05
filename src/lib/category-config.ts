export const APP_CATEGORY_SLUGS = [
  "horror",
  "the-walking-dead-universe",
  "movies",
  "retro-gaming",
  "retro-advertising",
] as const;

const appCategoryOrder: Record<string, number> = Object.fromEntries(
  APP_CATEGORY_SLUGS.map((slug, index) => [slug, index]),
);

export function isAllowedAppCategorySlug(slug: string) {
  return APP_CATEGORY_SLUGS.includes(slug as (typeof APP_CATEGORY_SLUGS)[number]);
}

export function sortCategoriesForApp<T extends { slug: string; name: string }>(categories: T[]) {
  return [...categories].sort((left, right) => {
    const leftIndex = appCategoryOrder[left.slug] ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = appCategoryOrder[right.slug] ?? Number.MAX_SAFE_INTEGER;

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.name.localeCompare(right.name);
  });
}
