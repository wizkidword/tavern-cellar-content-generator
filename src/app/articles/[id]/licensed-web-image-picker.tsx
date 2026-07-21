"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { sourceFeaturedImageFromWebAction } from "@/app/actions";
import type { WebImageCandidate } from "@/lib/web-image-search";

type SearchResponse = {
  images?: WebImageCandidate[];
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
  const [images, setImages] = useState<WebImageCandidate[]>([]);
  const [scope, setScope] = useState<"broad" | "licensed">("broad");
  const [feedback, setFeedback] = useState("");
  const [isSearching, startSearch] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const hasAutoSearched = useRef(false);

  const search = useCallback(() => {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < 3) {
      setFeedback("Enter at least three characters to search for a draft-reference image.");
      return;
    }

    startSearch(async () => {
      setFeedback("");

      try {
        const response = await fetch("/api/featured-images/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: normalizedQuery, scope }),
        });
        const payload = (await response.json()) as SearchResponse;

        if (!response.ok) {
          throw new Error(errorMessage(payload.error) || "The image search could not complete.");
        }

        setImages(payload.images ?? []);
        setFeedback(
          payload.images?.length
            ? scope === "broad"
              ? "Choose a high-quality web result for this draft. You can still send the draft to WordPress for testing."
              : "Choose an openly licensed image below. Its source and license stay attached to the draft."
            : scope === "broad"
              ? "No high-quality web images matched that search. Try a simpler or broader phrase."
              : "No reusable images matched that search. Try a simpler or broader phrase.",
        );
      } catch (error) {
        setImages([]);
        setFeedback(error instanceof Error ? error.message : "The image search could not complete.");
      }
    });
  }, [query, scope]);

  useEffect(() => {
    if (autoSearch && !hasAutoSearched.current) {
      hasAutoSearched.current = true;
      search();
    }
  }, [autoSearch, search]);

  function chooseImage(image: WebImageCandidate) {
    setFeedback("Saving this web image to the draft...");
    startSaving(() => {
      sourceFeaturedImageFromWebAction(articleId, image.source, image.assetId);
    });
  }

  return (
    <div className="rounded-[1.4rem] border border-[var(--line)] bg-black/10 p-4">
      <p className="text-sm font-semibold text-[#fff4e1]">Find a real image for this draft</p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        High-quality web testing searches are broad and may include images without reusable rights. You can send
        them to WordPress drafts for testing; replace or clear them before public publishing.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#c99a54]/50 bg-[#2b2116] px-3 py-3 text-xs leading-5 text-[#f2dfbd]">
          <input
            checked={scope === "broad"}
            className="mt-1 size-4 accent-[var(--accent)]"
            name="webImageScope"
            onChange={() => setScope("broad")}
            type="radio"
          />
          <span>
            <span className="block font-semibold text-[#fff4e1]">High-quality web results</span>
            Broad results for private draft testing.
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] bg-black/10 px-3 py-3 text-xs leading-5 text-[var(--muted)]">
          <input
            checked={scope === "licensed"}
            className="mt-1 size-4 accent-[var(--accent)]"
            name="webImageScope"
            onChange={() => setScope("licensed")}
            type="radio"
          />
          <span>
            <span className="block font-semibold text-[#fff4e1]">Reusable sources only</span>
            Wikimedia Commons and Openverse/Flickr.
          </span>
        </label>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          aria-label="Search draft-reference web images"
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
          {isSearching ? "Searching..." : scope === "broad" ? "Find high-quality images" : "Find reusable images"}
        </button>
      </div>

      {feedback ? <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{feedback}</p> : null}

      {images.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {images.map((image) => (
            <article
              className="overflow-hidden rounded-[1rem] border border-[var(--line)] bg-[#07110e]"
              key={`${image.source}:${image.assetId}`}
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
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#d7bf95]">
                  {image.providerLabel}
                </p>
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
                  {isSaving ? "Saving image..." : "Use in this draft"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
