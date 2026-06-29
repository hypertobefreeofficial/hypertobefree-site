"use client";

import {
  creationCenterStoryTemplates,
  creatorStudioLayoutOptions,
  type CreationCenterTemplateId,
  type CreatorStudioDesign,
} from "../../lib/creationCenter";

type CreatorStudioLayoutEditorProps = {
  design: CreatorStudioDesign;
  onChange: (updates: Partial<CreatorStudioDesign>) => void;
};

type EditorCopy = {
  eyebrow: string;
  title: string;
  helper: string;
  titleLabel: string;
  overlayLabel: string;
  captionLabel: string;
};

const defaultCopy: EditorCopy = {
  eyebrow: "Design editor",
  title: "Refine selected design",
  helper: "Adjust the words, layout, and mood before approval.",
  titleLabel: "Title",
  overlayLabel: "Overlay text",
  captionLabel: "Caption",
};

const editorCopy: Partial<Record<CreatorStudioDesign["layoutType"], EditorCopy>> =
  {
    "magazine-style": {
      eyebrow: "Magazine editor",
      title: "Tune the headline and editorial feel",
      helper: "Magazine concepts rely on strong typography, pacing, and a clear headline.",
      titleLabel: "Magazine headline",
      overlayLabel: "Cover line",
      captionLabel: "Story caption",
    },
    "timeline-story": {
      eyebrow: "Timeline editor",
      title: "Shape the journey",
      helper: "Use the text fields to clarify the before, breakthrough, and now.",
      titleLabel: "Timeline title",
      overlayLabel: "Breakthrough moment",
      captionLabel: "Timeline notes",
    },
    "photo-collage": {
      eyebrow: "Collage editor",
      title: "Arrange the visual story",
      helper: "Keep the headline short and the caption descriptive.",
      titleLabel: "Collage title",
      overlayLabel: "Main moment",
      captionLabel: "Photo story caption",
    },
    "video-photo-mixed": {
      eyebrow: "Hybrid editor",
      title: "Balance video, photo, and caption",
      helper: "This format works best with a concise headline and clear supporting caption.",
      titleLabel: "Hybrid headline",
      overlayLabel: "Video/photo overlay",
      captionLabel: "Media caption",
    },
    "before-after-testimony": {
      eyebrow: "Before / after editor",
      title: "Clarify the transformation",
      helper: "Focus on what changed and what God did.",
      titleLabel: "Transformation title",
      overlayLabel: "After statement",
      captionLabel: "Full testimony caption",
    },
    "scripture-card": {
      eyebrow: "Scripture card editor",
      title: "Refine the reflection",
      helper: "Use references only, not full copyrighted Bible text.",
      titleLabel: "Reflection title",
      overlayLabel: "Main reflection",
      captionLabel: "Reflection caption",
    },
    "prayer-request-card": {
      eyebrow: "Prayer card editor",
      title: "Shape the prayer request",
      helper: "Keep it clear, compassionate, and easy for others to pray with.",
      titleLabel: "Prayer title",
      overlayLabel: "Prayer focus",
      captionLabel: "Prayer context",
    },
    "praise-report-card": {
      eyebrow: "Praise report editor",
      title: "Highlight the praise",
      helper: "Let the joy come through without overcomplicating the card.",
      titleLabel: "Praise title",
      overlayLabel: "Praise statement",
      captionLabel: "Praise report caption",
    },
  };

export default function CreatorStudioLayoutEditor({
  design,
  onChange,
}: CreatorStudioLayoutEditorProps) {
  const copy = editorCopy[design.layoutType] ?? defaultCopy;

  return (
    <section className="space-y-4 rounded-[1.85rem] bg-white/95 p-4 shadow-xl shadow-blue-950/10 ring-1 ring-blue-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#0b63ce]">
            {copy.eyebrow}
          </div>
          <div className="mt-1 text-base font-black text-[#062a57]">
            {copy.title}
          </div>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {copy.helper}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#0b63ce]">
          Edit
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
          {copy.titleLabel}
          <input
            value={design.title}
            onChange={(event) =>
              onChange({
                title: event.target.value,
                overlayText: event.target.value,
              })
            }
            className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
          />
        </label>

        <label className="text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
          {copy.overlayLabel}
          <input
            value={design.overlayText}
            onChange={(event) => onChange({ overlayText: event.target.value })}
            className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
          />
        </label>
      </div>

      <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
        {copy.captionLabel}
        <textarea
          value={design.caption}
          onChange={(event) => onChange({ caption: event.target.value })}
          rows={4}
          className="mt-2 w-full resize-none rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-semibold normal-case leading-6 tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
          Template
          <select
            value={design.templateId}
            onChange={(event) =>
              onChange({
                templateId: event.target.value as CreationCenterTemplateId,
              })
            }
            className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
          >
            <option value="none">No template</option>
            {creationCenterStoryTemplates
              .filter((template) => template.imagePath)
              .map((template) => (
                <option key={template.id} value={template.id}>
                  {template.label}
                </option>
              ))}
          </select>
        </label>

        <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
          Layout
          <select
            value={design.layoutType}
            onChange={(event) =>
              onChange({
                layoutType: event.target.value as CreatorStudioDesign["layoutType"],
              })
            }
            className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
          >
            {creatorStudioLayoutOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
          Mood
          <input
            value={design.styleMood}
            onChange={(event) => onChange({ styleMood: event.target.value })}
            className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
          />
        </label>
      </div>

      <label className="block text-xs font-black uppercase tracking-[0.12em] text-[#0b63ce]">
        Scripture suggestion
        <input
          value={design.scriptureSuggestion}
          onChange={(event) =>
            onChange({ scriptureSuggestion: event.target.value })
          }
          placeholder="Reference only, such as John 8:36"
          className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#062a57] outline-none focus:border-[#0b63ce] focus:ring-4 focus:ring-blue-100"
        />
      </label>
    </section>
  );
}
