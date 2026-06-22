"use client";

import { Check, Sparkles } from "lucide-react";
import {
  CREATION_CENTER_IMAGES_ENABLED,
  creationCenterStoryTemplates,
  type CreationCenterTemplateId,
} from "../../lib/creationCenter";

type StoryTemplatePickerProps = {
  value: CreationCenterTemplateId;
  onChange: (templateId: CreationCenterTemplateId) => void;
};

export default function StoryTemplatePicker({
  value,
  onChange,
}: StoryTemplatePickerProps) {
  if (!CREATION_CENTER_IMAGES_ENABLED) return null;

  return (
    <section className="min-w-0 max-w-full">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm font-black text-[#062a57]">
            Choose a Story Template
          </div>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            Pick an optional visual starting point for your story.
          </p>
        </div>
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-amber-700">
          Preview only - not saved yet
        </span>
      </div>

      <div className="mt-4 flex w-full max-w-full gap-3 overflow-x-auto px-0.5 pb-3 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">
        {creationCenterStoryTemplates.map((template) => {
          const selected = value === template.id;

          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onChange(template.id)}
              aria-pressed={selected}
              className={`group relative h-32 w-44 shrink-0 overflow-hidden rounded-[1.25rem] text-left ring-2 transition sm:w-auto ${
                selected
                  ? "ring-[#0b63ce] ring-offset-2"
                  : "ring-transparent hover:ring-blue-200"
              }`}
            >
              {template.imagePath ? (
                <img
                  src={template.imagePath}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                />
              ) : (
                <span className="absolute inset-0 bg-gradient-to-br from-[#062a57] via-[#0b63ce] to-[#69b7ff]" />
              )}

              <span className="absolute inset-0 bg-gradient-to-t from-[#031d3d]/95 via-[#062a57]/35 to-transparent" />

              {!template.imagePath && (
                <Sparkles className="absolute right-3 top-3 h-5 w-5 text-white/80" />
              )}

              {selected && (
                <span className="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#0b63ce] shadow-sm">
                  <Check className="h-4 w-4" />
                </span>
              )}

              <span className="absolute inset-x-3 bottom-3 z-10">
                <span className="block text-xs font-black text-white">
                  {template.label}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-[10px] font-semibold leading-4 text-blue-50/90">
                  {template.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
