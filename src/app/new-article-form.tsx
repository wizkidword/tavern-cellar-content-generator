"use client";

import { useMemo, useState } from "react";

import { generateArticleAction } from "@/app/actions";

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
  error?: string;
};

async function postAssistRequest(pathname: string, body: Record<string, unknown>) {
  const response = await fetch(pathname, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as AssistResponse;

  if (!response.ok) {
    throw new Error(payload.error || "The AI helper could not complete that request.");
  }

  return payload.suggestions ?? [];
}

export function NewArticleForm({ categories }: NewArticleFormProps) {
  const [categoryId, setCategoryId] = useState("");
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [angle, setAngle] = useState("");
  const [notes, setNotes] = useState("");
  const [generateImage, setGenerateImage] = useState(true);
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([]);
  const [angleSuggestions, setAngleSuggestions] = useState<string[]>([]);
  const [assistError, setAssistError] = useState("");
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [isGeneratingAngles, setIsGeneratingAngles] = useState(false);

  const selectedCategory = useMemo(
    () => categories.find((category) => String(category.id) === categoryId) ?? null,
    [categories, categoryId],
  );

  async function handleGenerateKeywords() {
    if (!categoryId) {
      setAssistError("Pick a category first, then AI can suggest primary keywords.");
      return;
    }

    setAssistError("");
    setIsGeneratingKeywords(true);

    try {
      const suggestions = await postAssistRequest("/api/assist/keywords", {
        categoryId: Number(categoryId),
        notes,
      });

      setKeywordSuggestions(suggestions);
      if (!primaryKeyword && suggestions[0]) {
        setPrimaryKeyword(suggestions[0]);
      }
    } catch (error) {
      setAssistError(error instanceof Error ? error.message : "Keyword generation failed.");
    } finally {
      setIsGeneratingKeywords(false);
    }
  }

  async function handleGenerateAngles() {
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

    try {
      const suggestions = await postAssistRequest("/api/assist/angles", {
        categoryId: Number(categoryId),
        primaryKeyword,
        notes,
      });

      setAngleSuggestions(suggestions);
      if (!angle && suggestions[0]) {
        setAngle(suggestions[0]);
      }
    } catch (error) {
      setAssistError(error instanceof Error ? error.message : "Angle generation failed.");
    } finally {
      setIsGeneratingAngles(false);
    }
  }

  function resetSuggestionsForCategory(nextCategoryId: string) {
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
            className="action-secondary px-4 py-3 text-sm"
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
            className="action-secondary px-4 py-3 text-sm"
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

      <label className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-black/10 px-4 py-3 text-sm text-[#eadbbe]">
        <input
          checked={generateImage}
          className="size-4 accent-[var(--accent)]"
          name="generateImage"
          onChange={(event) => setGenerateImage(event.target.checked)}
          type="checkbox"
        />
        Generate a featured image asset after the article is created.
      </label>

      <button className="action-primary w-full" type="submit">
        Generate Article Draft
      </button>
    </form>
  );
}
