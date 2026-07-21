import assert from "node:assert/strict";
import test from "node:test";

import { searchBroadWebImages } from "@/lib/broad-web-image-search";

test("returns high-resolution landscape web images for draft testing", async () => {
  const originalFetch = global.fetch;
  const requests: Array<{ url: URL; headers: Headers }> = [];

  global.fetch = (async (url, init) => {
    const requestUrl = new URL(String(url));
    requests.push({ url: requestUrl, headers: new Headers(init?.headers) });

    if (requestUrl.pathname === "/") {
      return new Response('<html><script>var vqd="test-image-token";</script></html>', { status: 200 });
    }

    return new Response(
      JSON.stringify({
        results: [
          {
            height: 1080,
            image: "https://images.example.test/game-of-thrones.jpg",
            thumbnail: "https://thumbs.example.test/game-of-thrones.jpg",
            title: "Game of Thrones Season 2 Episode 5",
            url: "https://www.screenrant.com/game-of-thrones-season-2-episode-5/",
            width: 2160,
          },
          {
            height: 500,
            image: "https://images.example.test/too-small.jpg",
            thumbnail: "https://thumbs.example.test/too-small.jpg",
            title: "Too small",
            url: "https://example.test/too-small",
            width: 900,
          },
          {
            height: 2160,
            image: "https://images.example.test/wrong-episode.jpg",
            thumbnail: "https://thumbs.example.test/wrong-episode.jpg",
            title: "Game of Thrones Season 6 Episode 2",
            url: "https://www.screenrant.com/game-of-thrones-season-6-episode-2/",
            width: 3840,
          },
          {
            height: 1600,
            image: "https://images.example.test/portrait.jpg",
            thumbnail: "https://thumbs.example.test/portrait.jpg",
            title: "Portrait image",
            url: "https://example.test/portrait",
            width: 1000,
          },
          {
            height: 1080,
            image: "http://images.example.test/not-https.jpg",
            thumbnail: "https://thumbs.example.test/not-https.jpg",
            title: "Not HTTPS",
            url: "https://example.test/not-https",
            width: 1920,
          },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const images = await searchBroadWebImages("Game of Thrones season 2 episode 5");

    assert.equal(images.length, 1);
    assert.equal(images[0]?.title, "Game of Thrones Season 2 Episode 5");
    assert.equal(images[0]?.providerLabel, "Broad web (testing)");
    assert.equal(images[0]?.attribution, "Draft web reference from screenrant.com");
    assert.ok((images[0]?.assetId.length ?? 0) > 24);
    assert.equal(requests[1]?.url.pathname, "/i.js");
    assert.equal(
      requests[1]?.url.searchParams.get("q"),
      'Game of Thrones season 2 episode 5 "Season 2" "Episode 5"',
    );
    assert.equal(requests[1]?.url.searchParams.get("vqd"), "test-image-token");
    assert.match(requests[1]?.headers.get("User-Agent") ?? "", /TavernCellarFoundry/);
  } finally {
    global.fetch = originalFetch;
  }
});
