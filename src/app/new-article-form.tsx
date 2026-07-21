"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { generateArticleAction } from "@/app/actions";
import { MAX_ARTICLE_BODY_IMAGE_COUNT } from "@/lib/article-body-images";
import {
  DEFAULT_FAL_IMAGE_MODEL,
  DEFAULT_FEATURED_IMAGE_PROVIDER,
  DEFAULT_OPENAI_IMAGE_MODEL,
  FAL_IMAGE_MODEL_OPTIONS,
  FEATURED_IMAGE_PROVIDER_OPTIONS,
  OPENAI_IMAGE_MODEL_OPTIONS,
} from "@/lib/featured-image-models";
import {
  DEFAULT_OPENAI_TEXT_MODEL,
  OPENAI_TEXT_MODEL_OPTIONS,
} from "@/lib/openai-models";

type CategoryOption = {
  id: number;
  name: string;
  postCount: number;
};

type NewArticleFormProps = {
  categories: CategoryOption[];
};

type AssistResponse = {
  suggestions?: string[];
  error?: string | { code: string; correlationId?: string; message: string };
};

function assistErrorMessage(error: AssistResponse["error"]) {
  return typeof error === "string" ? error : error?.message;
}

async function postAssistRequest(
  pathname: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  const response = await fetch(pathname, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  const payload = (await response.json()) as AssistResponse;

  if (!response.ok) {
    throw new Error(assistErrorMessage(payload.error) || "The AI helper could not complete that request.");
  }

  return payload.suggestions ?? [];
}

function GenerateArticleSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending}
      className="action-primary w-full disabled:cursor-wait disabled:opacity-70"
      disabled={pending}
      type="submit"
    >
      {pending ? "Generating Article Draft..." : "Generate Article Draft"}
    </button>
  );
}

export function NewArticleForm({ categories }: NewArticleFormProps) {
  const [categoryId, setCategoryId] = useState("");
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [angle, setAngle] = useState("");
  const [notes, setNotes] = useState("");
  const [generateImage, setGenerateImage] = useState(false);
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([]);
  const [angleSuggestions, setAngleSuggestions] = useState<string[]>([]);
  const [assistError, setAssistError] = useState("");
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [isGeneratingAngles, setIsGeneratingAngles] = useState(false);
  const keywordRequestController = useRef<AbortController | null>(null);
  const angleRequestController = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      keywordRequestController.current?.abort();
      angleRequestController.current?.abort();
    };
  }, []);

  const selectedCategory = useMemo(
    () => categories.find((category) => String(category.id) === categoryId) ?? null,
    [categories, categoryId],
  );

  async function handleGenerateKeywords() {
    if (isGeneratingKeywords) {
      return;
    }

    if (!categoryId) {
      setAssistError("Pick a category first, then AI can suggest primary keywords.");
      return;
    }

    setAssistError("");
    setIsGeneratingKeywords(true);
    keywordRequestController.current?.abort();
    const controller = new AbortController();
    keywordRequestController.current = controller;

    try {
      const suggestions = await postAssistRequest("/api/assist/keywords", {
        categoryId: Number(categoryId),
        notes,
      }, controller.signal);

      setKeywordSuggestions(suggestions);
      if (!primaryKeyword && suggestions[0]) {
        setPrimaryKeyword(suggestions[0]);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setAssistError(error instanceof Error ? error.message : "Keyword generation failed.");
      }
    } finally {
      if (keywordRequestController.current === controller) {
        keywordRequestController.current = null;
        setIsGeneratingKeywords(false);
      }
    }
  }

  async function handleGenerateAngles() {
    if (isGeneratingAngles) {
      return;
    }

    if (!categoryId) {
      setAssistError("Pick a category first, then AI can suggest angles.");
      return;
    }

    if (!primaryKeyword.trim()) {
      setAssistError("Add or generate a primary keyword first, then AI can build article angles from it.");
      return;
    }

    setAssistError("");
    setIsGeneratingAngles(true);
    angleRequestController.current?.abort();
    const controller = new AbortController();
    angleRequestController.current = controller;

    try {
      const suggestions = await postAssistRequest("/api/assist/angles", {
        categoryId: Number(categoryId),
        primaryKeyword,
        notes,
      }, controller.signal);

      setAngleSuggestions(suggestions);
      if (!angle && suggestions[0]) {
        setAngle(suggestions[0]);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setAssistError(error instanceof Error ? error.message : "Angle generation failed.");
      }
    } finally {
      if (angleRequestController.current === controller) {
        angleRequestController.current = null;
        setIsGeneratingAngles(false);
      }
    }
  }

  function resetSuggestionsForCategory(nextCategoryId: string) {
    keywordRequestController.current?.abort();
    angleRequestController.current?.abort();
    setCategoryId(nextCategoryId);
    setPrimaryKeyword("");
    setAngle("");
    setKeywordSuggestions([]);
    setAngleSuggestions([]);
    setAssistError("");
  }

  return (
    <form action={generateArticleAction} className="space-y-5">
      <div>
        <label className="label" htmlFor="categoryId">
          Category
        </label>
        <select
          className="field"
          id="categoryId"
          name="categoryId"
          value={categoryId}
          onChange={(event) => resetSuggestionsForCategory(event.target.value)}
          required
        >
          <option value="" disabled>
            Choose one content lane
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name} ({category.postCount} live posts)
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-[1.25rem] border border-[var(--line)] bg-black/10 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="label mb-1">Primary Keyword</p>
            <p className="text-sm text-[var(--muted)]">
              Start with your own topic or let AI suggest searchable keywords for{" "}
              {selectedCategory ? selectedCategory.name : "the selected category"}.
            </p>
          </div>
          <button
            aria-busy={isGeneratingKeywords}
            className="action-secondary px-4 py-3 text-sm"
            disabled={isGeneratingKeywords}
            onClick={handleGenerateKeywords}
            type="button"
          >
            {isGeneratingKeywords ? "Generating Keywords..." : "AI Keyword Ideas"}
          </button>
        </div>

        <input
          className="field"
          id="primaryKeyword"
          name="primaryKeyword"
          onChange={(event) => setPrimaryKeyword(event.target.value)}
          placeholder="Example: A Nightmare on Elm Street"
          required
          value={primaryKeyword}
        />

        {keywordSuggestions.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {keywordSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                className={`suggestion-chip ${primaryKeyword === suggestion ? "suggestion-chip-active" : ""}`}
                onClick={() => setPrimaryKeyword(suggestion)}
                type="button"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-[1.25rem] border border-[var(--line)] bg-black/10 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="label mb-1">Angle</p>
            <p className="text-sm text-[var(--muted)]">
              Give AI the keyword and it will suggest article directions that can lead to a strong draft.
            </p>
          </div>
          <button
            aria-busy={isGeneratingAngles}
            className="action-secondary px-4 py-3 text-sm"
            disabled={isGeneratingAngles}
            onClick={handleGenerateAngles}
            type="button"
          >
            {isGeneratingAngles ? "Generating Angles..." : "AI Angle Ideas"}
          </button>
        </div>

        <textarea
          className="field min-h-28"
          id="angle"
          name="angle"
          onChange={(event) => setAngle(event.target.value)}
          placeholder="Example: explain why A Nightmare on Elm Street still sets the standard for dream-horror iconography"
          required
          value={angle}
        />

        {angleSuggestions.length > 0 ? (
          <div className="mt-3 space-y-2">
            {angleSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                className={`suggestion-block ${angle === suggestion ? "suggestion-block-active" : ""}`}
                onClick={() => setAngle(suggestion)}
                type="button"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div>
        <label className="label" htmlFor="notes">
          Editorial Notes
        </label>
        <textarea
          className="field min-h-24"
          id="notes"
          name="notes"
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional guardrails, hooks, or subtopics for AI to keep in mind."
          value={notes}
        />
      </div>

      {assistError ? <p className="message message-error">{assistError}</p> : null}

      <div>
        <label className="label" htmlFor="textModel">
          AI Draft Model
        </label>
        <select
          className="field"
          defaultValue={DEFAULT_OPENAI_TEXT_MODEL}
          id="textModel"
          name="textModel"
          required
        >
          {OPENAI_TEXT_MODEL_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-black/10 px-4 py-3 text-sm text-[#eadbbe]">
        <input
          checked={generateImage}
          className="size-4 accent-[var(--accent)]"
          name="generateImage"
          onChange={(event) => setGenerateImage(event.target.checked)}
          type="checkbox"
        />
        Generate a featured image before opening the draft.
      </label>

      <div>
        <label className="label" htmlFor="bodyImageCount">
          Images Inside Article
        </label>
        <select className="field" defaultValue="0" id="bodyImageCount" name="bodyImageCount">
          {Array.from({ length: MAX_ARTICLE_BODY_IMAGE_COUNT + 1 }, (_, count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="imageProvider">
          Image Generator
        </label>
        <select
          className="field"
          defaultValue={DEFAULT_FEATURED_IMAGE_PROVIDER}
          id="imageProvider"
          name="imageProvider"
          required
        >
          {FEATURED_IMAGE_PROVIDER_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="falImageModel">
          fal.ai Model
        </label>
        <select
          className="field"
          defaultValue={DEFAULT_FAL_IMAGE_MODEL}
          id="falImageModel"
          name="falImageModel"
          required
        >
          {FAL_IMAGE_MODEL_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="openAiImageModel">
          GPT Image Model
        </label>
        <select
          className="field"
          defaultValue={DEFAULT_OPENAI_IMAGE_MODEL}
          id="openAiImageModel"
          name="openAiImageModel"
          required
        >
          {OPENAI_IMAGE_MODEL_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <GenerateArticleSubmitButton />
    </form>
  );
}
