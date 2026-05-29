"use client";

import { ArrowClockwise, ArrowUpRight, Sparkle } from "@phosphor-icons/react";
import type { FormEvent } from "react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StateBlock } from "@/components/ui/StateBlock";
import type { EditRecipeResponse } from "@/lib/cookpilot/types";

export type AIEditSectionState = {
  prompt: string;
  loading: boolean;
  error: string | null;
  refusal: string | null;
  result: EditRecipeResponse | null;
};

export function AIEditSection({
  editState,
  onPromptChange,
  onApplyPrompt,
  suggestions,
}: {
  editState: AIEditSectionState;
  onPromptChange: (prompt: string) => void;
  onApplyPrompt: (prompt?: string) => void;
  suggestions: string[];
}) {
  const trimmedPrompt = editState.prompt.trim();

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedPrompt || editState.loading) return;
    onApplyPrompt(trimmedPrompt);
  }

  return (
    <section className="cp-detail__section-card cp-detail__section-card--ai-edit" id="cp-edit-section">
      <SectionHeader title="Make changes">
        <Sparkle size={20} />
      </SectionHeader>

      <form className="cp-ai-edit-form" onSubmit={submitPrompt}>
        <textarea
          aria-label="What should change?"
          className="cp-ai-edit-form__input"
          disabled={editState.loading}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Make this dairy-free, or halve the garlic and add more lemon."
          rows={3}
          value={editState.prompt}
        />
        <button
          aria-label="Apply AI edit"
          className="cp-ai-edit-form__send"
          disabled={editState.loading || !trimmedPrompt}
          type="submit"
        >
          {editState.loading ? (
            <ArrowClockwise className="cp-spin" size={16} />
          ) : (
            <ArrowUpRight size={16} weight="bold" />
          )}
        </button>
      </form>

      {suggestions.length > 0 ? (
        <div className="cp-ai-edit-suggestions" aria-label="AI edit suggestions">
          {suggestions.map((suggestion) => (
            <button
              className="cp-ai-edit-suggestion"
              disabled={editState.loading}
              key={suggestion}
              onClick={() => onApplyPrompt(suggestion)}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {editState.error ? (
        <StateBlock message={editState.error} title="Edit issue" tone="error" />
      ) : null}
      {editState.refusal ? (
        <StateBlock message={editState.refusal} title="No changes made" tone="error" />
      ) : null}
      {editState.result ? (
        <div className="cp-ai-summary">
          <p>{editState.result.changesSummary}</p>
          <p className="cp-ai-summary__meta">
            {editState.result.confidence} confidence
            {editState.result.confidenceReason
              ? ` • ${editState.result.confidenceReason}`
              : ""}
          </p>
        </div>
      ) : null}
    </section>
  );
}
