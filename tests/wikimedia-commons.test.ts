import assert from "node:assert/strict";
import test from "node:test";

import { searchLicensedWikimediaImages } from "@/lib/wikimedia-commons";

test("returns only reusable, provider-hosted Wikimedia Commons images", async () => {
  const originalFetch = global.fetch;
  const requests: Array<{ url: URL; headers: Headers }> = [];

  global.fetch = (async (url, init) => {
    const requestUrl = new URL(String(url));
    requests.push({ url: requestUrl, headers: new Headers(init?.headers) });

    if (requestUrl.searchParams.get("list") === "search") {
      return new Response(
        JSON.stringify({
          query: {
            search: [
              { title: "File:Reusable Game of Thrones Castle.jpg" },
              { title: "File:Noncommercial Game of Thrones Castle.jpg" },
            ],
          },
        }),
        { status: 200 },
      );
    }

    return new Response(
      JSON.stringify({
        query: {
          pages: {
            "1": {
              title: "File:Reusable Game of Thrones Castle.jpg",
              imageinfo: [
                {
                  descriptionurl:
                    "https://commons.wikimedia.org/wiki/File:Reusable_Game_of_Thrones_Castle.jpg",
                  url: "https://upload.wikimedia.org/wikipedia/commons/a/a1/reusable.jpg",
                  thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/reusable.jpg/640px-reusable.jpg",
                  mime: "image/jpeg",
                  width: 1200,
                  height: 800,
                  thumbwidth: 640,
                  thumbheight: 427,
                  extmetadata: {
                    Artist: { value: "<a>Jordan &amp; Casey</a>" },
                    LicenseShortName: { value: "CC BY-SA 4.0" },
                    LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
                  },
                },
              ],
            },
            "2": {
              title: "File:Noncommercial Game of Thrones Castle.jpg",
              imageinfo: [
                {
                  descriptionurl:
                    "https://commons.wikimedia.org/wiki/File:Noncommercial_Game_of_Thrones_Castle.jpg",
                  url: "https://upload.wikimedia.org/wikipedia/commons/a/a2/noncommercial.jpg",
                  thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/noncommercial.jpg/640px-noncommercial.jpg",
                  mime: "image/jpeg",
                  width: 1200,
                  height: 800,
                  thumbwidth: 640,
                  thumbheight: 427,
                  extmetadata: {
                    LicenseShortName: { value: "CC BY-NC 4.0" },
                  },
                },
              ],
            },
          },
        },
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const images = await searchLicensedWikimediaImages("Game of Thrones");

    assert.equal(images.length, 1);
    assert.equal(images[0]?.title, "Reusable Game of Thrones Castle");
    assert.equal(images[0]?.attribution, "Jordan & Casey via Wikimedia Commons · CC BY-SA 4.0");
    assert.equal(images[0]?.licenseUrl, "https://creativecommons.org/licenses/by-sa/4.0");
    assert.equal(requests[0]?.url.searchParams.get("srnamespace"), "6");
    assert.match(requests[0]?.headers.get("User-Agent") ?? "", /TavernCellarFoundry/);
  } finally {
    global.fetch = originalFetch;
  }
});
