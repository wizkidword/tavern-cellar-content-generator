"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { sourceFeaturedImageFromWebAction } from "@/app/actions";
import type { WikimediaImageCandidate } from "@/lib/wikimedia-commons";

type SearchResponse = {
  images?: WikimediaImageCandidate[];
  error?: { message?: string } | string;
};

function errorMessage(error: SearchResponse["error"]) {
  return typeof error === "string" ? error : error?.message;
}

type LicensedWebImagePickerProps = {
  articleId: string;
  defaultQuery: string;
  autoSearch?: boolean;
};

export function LicensedWebImagePicker({
  articleId,
  defaultQuery,
  autoSearch = false,
}: LicensedWebImagePickerProps) {
  const [query, setQuery] = useState(defaultQuery);
  const [images, setImages] = useState<WikimediaImageCandidate[]>([]);
  const [feedback, setFeedback] = useState("");
  const [isSearching, startSearch] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const hasAutoSearched = useRef(false);

  const search = useCallback(() => {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < 3) {
      setFeedback("Enter at least three characters to search for a licensed image.");
      return;
    }

    startSearch(async () => {
      setFeedback("");

      try {
        const response = await fetch("/api/featured-images/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: normalizedQuery }),
        });
        const payload = (await response.json()) as SearchResponse;

        if (!response.ok) {
          throw new Error(errorMessage(payload.error) || "The image search could not complete.");
        }

        setImages(payload.images ?? []);
        setFeedback(
          payload.images?.length
            ? "Choose an image below. Its creator and license will travel with the WordPress post."
            : "No reusable images matched that search. Try a simpler or broader phrase.",
        );
      } catch (error) {
        setImages([]);
        setFeedback(error instanceof Error ? error.message : "The image search could not complete.");
      }
    });
  }, [query]);

  useEffect(() => {
    if (autoSearch && !hasAutoSearched.current) {
      hasAutoSearched.current = true;
      search();
    }
  }, [autoSearch, search]);

  function chooseImage(image: WikimediaImageCandidate) {
    setFeedback("Saving this licensed image to the article...");
    startSaving(() => {
      sourceFeaturedImageFromWebAction(articleId, image.fileTitle);
    });
  }

  return (
    <div className="rounded-[1.4rem] border border-[var(--line)] bg-black/10 p-4">
      <p className="text-sm font-semibold text-[#fff4e1]">Use a real licensed web image instead</p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        Search Wikimedia Commons. Foundry only offers reusable images, saves a local copy, and adds
        the visible credit when you send the post to WordPress.
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          aria-label="Search licensed web images"
          className="field min-w-0 flex-1"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              search();
            }
          }}
          value={query}
        />
        <button
          className="action-secondary shrink-0 disabled:cursor-wait disabled:opacity-70"
          disabled={isSearching || isSaving}
          onClick={search}
          type="button"
        >
          {isSearching ? "Searching..." : "Find licensed images"}
        </button>
      </div>

      {feedback ? <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{feedback}</p> : null}

      {images.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {images.map((image) => (
            <article
              className="overflow-hidden rounded-[1rem] border border-[var(--line)] bg-[#07110e]"
              key={image.fileTitle}
            >
              {/* This preview has a provider-validated HTTPS URL and is not app content. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                className="aspect-video w-full bg-black/20 object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
                src={image.thumbnailUrl}
              />
              <div className="space-y-2 p-3">
                <p className="line-clamp-2 text-sm font-semibold text-[#fff4e1]">{image.title}</p>
                <p className="text-xs leading-5 text-[var(--muted)]">{image.attribution}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <a
                    className="text-[#f4ba65] underline"
                    href={image.descriptionUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Source
                  </a>
                  {image.licenseUrl ? (
                    <a
                      className="text-[#f4ba65] underline"
                      href={image.licenseUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      License
                    </a>
                  ) : null}
                </div>
                <button
                  className="action-primary w-full disabled:cursor-wait disabled:opacity-70"
                  disabled={isSearching || isSaving}
                  onClick={() => chooseImage(image)}
                  type="button"
                >
                  {isSaving ? "Saving image..." : "Use this featured image"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
