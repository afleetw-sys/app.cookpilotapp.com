"use client";

import { ArrowClockwise, ArrowUpRight, Sparkle } from "@phosphor-icons/react";
import type { FormEvent } from "react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StateBlock } from "@/components/ui/StateBlock";
import type { EditRecipeResponse } from "@/lib/cookpilot/types";
import type { UsageInfo } from "@/lib/cookpilot/usageTracking";
import { formatResetDate } from "@/lib/cookpilot/usageTracking";

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
  onUpgradeTapped,
  suggestions,
  usageInfo,
}: {
  editState: AIEditSectionState;
  onPromptChange: (prompt: string) => void;
  onApplyPrompt: (prompt?: string) => void;
  onUpgradeTapped: () => void;
  suggestions: string[];
  usageInfo: UsageInfo | null;
}) {
  const trimmedPrompt = editState.prompt.trim();
  const isOutOfEdits =
    usageInfo !== null && !usageInfo.isSubscribed && (usageInfo.remaining ?? 0) <= 0;
  const isDisabled = editState.loading || isOutOfEdits;

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedPrompt || isDisabled) return;
    onApplyPrompt(trimmedPrompt);
  }

  return (
    <section className="cp-detail__section-card cp-detail__section-card--ai-edit" id="cp-edit-section">
      <SectionHeader title="Make changes">
        <Sparkle size={20} />
      </SectionHeader>

      {/* Usage banner — shown when not subscribed */}
      {usageInfo && !usageInfo.isSubscribed && usageInfo.remaining !== null && usageInfo.total !== null ? (
        <div className="cp-ai-usage-banner">
          <div className="cp-ai-usage-banner__text">
            <span className="cp-ai-usage-banner__title">
              {usageInfo.remaining > 0
                ? `${usageInfo.remaining} of ${usageInfo.total} free AI edits left`
                : "Free limit reached"}
            </span>
            {usageInfo.resetDate ? (
              <span className="cp-ai-usage-banner__subtitle">
                {usageInfo.remaining > 0
                  ? `Resets ${formatResetDate(usageInfo.resetDate)}`
                  : `More edits ${formatResetDate(usageInfo.resetDate)}`}
              </span>
            ) : null}
          </div>
          <button
            className="cp-ai-usage-banner__upgrade"
            onClick={onUpgradeTapped}
            type="button"
          >
            <Sparkle size={13} weight="fill" />
            Go unlimited
          </button>
        </div>
      ) : null}

      <form className="cp-ai-edit-form" onSubmit={submitPrompt}>
        <textarea
          aria-label="What should change?"
          className="cp-ai-edit-form__input"
          disabled={isDisabled}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder={
            isOutOfEdits
              ? "Upgrade to keep editing with AI."
              : "Make this dairy-free, or halve the garlic and add more lemon."
          }
          rows={3}
          value={editState.prompt}
        />
        <button
          aria-label="Apply AI edit"
          className="cp-ai-edit-form__send"
          disabled={isDisabled || !trimmedPrompt}
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
              disabled={isDisabled}
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
