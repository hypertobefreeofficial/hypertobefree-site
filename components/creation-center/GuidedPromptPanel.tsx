"use client";

import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  creationCenterPrompts,
  type CreationCenterStoryType,
} from "../../lib/creationCenter";

type GuidedPromptPanelProps = {
  storyType: CreationCenterStoryType;
  answers: Record<string, string>;
  onAnswerChange: (promptId: string, value: string) => void;
  onUseAnswers: () => void;
};

export default function GuidedPromptPanel({
  storyType,
  answers,
  onAnswerChange,
  onUseAnswers,
}: GuidedPromptPanelProps) {
  const [activePromptIndex, setActivePromptIndex] = useState(0);
  const prompts = creationCenterPrompts[storyType];
  const activePrompt = prompts[activePromptIndex] ?? prompts[0];
  const completedCount = prompts.filter(
    (prompt) => Boolean(answers[prompt.id]?.trim())
  ).length;

  useEffect(() => {
    setActivePromptIndex(0);
  }, [storyType]);

  if (!activePrompt) return null;

  return (
    <section className="min-w-0 max-w-full">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-black text-[#062a57]">
            Gentle guidance
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Answer what helps. Skip anything that does not fit your story.
          </p>
        </div>
        <span className="shrink-0 text-xs font-black text-[#0b63ce]">
          {activePromptIndex + 1} of {prompts.length}
        </span>
      </div>

      <div className="mt-4 rounded-[1.5rem] bg-white p-4 ring-1 ring-blue-100">
        <label className="block">
          <span className="block text-base font-black leading-6 text-[#062a57]">
            {activePrompt.label}
          </span>
          <textarea
            value={answers[activePrompt.id] ?? ""}
            onChange={(event) =>
              onAnswerChange(activePrompt.id, event.target.value)
            }
            rows={4}
            placeholder={activePrompt.placeholder}
            className="mt-3 w-full max-w-full resize-none rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
            style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
          />
        </label>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              setActivePromptIndex((current) => Math.max(0, current - 1))
            }
            disabled={activePromptIndex === 0}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 disabled:opacity-40"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>

          {activePromptIndex < prompts.length - 1 ? (
            <button
              type="button"
              onClick={() =>
                setActivePromptIndex((current) =>
                  Math.min(prompts.length - 1, current + 1)
                )
              }
              className="inline-flex items-center gap-1 rounded-full bg-[#0b63ce] px-4 py-2 text-xs font-black text-white"
            >
              Next
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onUseAnswers}
              disabled={completedCount === 0}
              className="inline-flex items-center gap-1 rounded-full bg-[#0b63ce] px-4 py-2 text-xs font-black text-white disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Add to my story
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-1.5" aria-hidden="true">
        {prompts.map((prompt, index) => (
          <span
            key={prompt.id}
            className={`h-1.5 flex-1 rounded-full ${
              answers[prompt.id]?.trim()
                ? "bg-emerald-400"
                : index === activePromptIndex
                  ? "bg-[#0b63ce]"
                  : "bg-slate-200"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
