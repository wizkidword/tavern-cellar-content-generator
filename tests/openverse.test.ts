import assert from "node:assert/strict";
import test from "node:test";

import { searchLicensedOpenverseImages } from "@/lib/openverse";

test("keeps high-resolution openly licensed Flickr images from Openverse and favors featured-image shapes", async () => {
  const originalFetch = global.fetch;
  const requests: Array<{ url: URL; headers: Headers }> = [];

  global.fetch = (async (url, init) => {
    const requestUrl = new URL(String(url));
    requests.push({ url: requestUrl, headers: new Headers(init?.headers) });

    return new Response(
      JSON.stringify({
        results: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            title: "Portrait reference",
            creator: "Portrait Creator",
            source: "flickr",
            license: "by",
            license_version: "2.0",
            license_url: "https://creativecommons.org/licenses/by/2.0/",
            foreign_landing_url: "https://www.flickr.com/photos/example/1",
            url: "https://live.staticflickr.com/1/portrait.jpg",
            thumbnail: "https://api.openverse.org/v1/images/11111111-1111-4111-8111-111111111111/thumb/",
            width: 800,
            height: 1200,
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            title: "Wide reference",
            creator: "Wide Creator",
            source: "flickr",
            license: "by-sa",
            license_version: "4.0",
            license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
            foreign_landing_url: "https://www.flickr.com/photos/example/2",
            url: "https://live.staticflickr.com/2/wide.jpg",
            thumbnail: "https://api.openverse.org/v1/images/22222222-2222-4222-8222-222222222222/thumb/",
            width: 1600,
            height: 900,
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            title: "Noncommercial reference",
            creator: "Restricted Creator",
            source: "flickr",
            license: "by-nc",
            foreign_landing_url: "https://www.flickr.com/photos/example/3",
            url: "https://live.staticflickr.com/3/restricted.jpg",
            thumbnail: "https://api.openverse.org/v1/images/33333333-3333-4333-8333-333333333333/thumb/",
            width: 1600,
            height: 900,
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            title: "Untrusted host reference",
            creator: "Unsafe Creator",
            source: "flickr",
            license: "by",
            foreign_landing_url: "https://www.flickr.com/photos/example/4",
            url: "https://untrusted.example/image.jpg",
            thumbnail: "https://api.openverse.org/v1/images/44444444-4444-4444-8444-444444444444/thumb/",
            width: 1600,
            height: 900,
          },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const images = await searchLicensedOpenverseImages("Game of Thrones");

    assert.equal(images.length, 2);
    assert.equal(images[0]?.title, "Wide reference");
    assert.equal(images[0]?.providerLabel, "Openverse / Flickr");
    assert.equal(images[0]?.attribution, "Wide Creator via Openverse / Flickr · CC BY-SA 4.0");
    assert.equal(images[1]?.title, "Portrait reference");
    assert.equal(requests[0]?.url.searchParams.get("source"), "flickr");
    assert.equal(requests[0]?.url.searchParams.get("license"), "by,by-sa,cc0,pdm");
    assert.match(requests[0]?.headers.get("User-Agent") ?? "", /TavernCellarFoundry/);
  } finally {
    global.fetch = originalFetch;
  }
});
