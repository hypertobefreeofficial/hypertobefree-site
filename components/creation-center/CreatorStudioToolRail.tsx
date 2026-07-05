"use client";

import {
  BookOpen,
  Palette,
  Sparkles,
  Type,
} from "lucide-react";
import type { ComponentType } from "react";

export type CreatorStudioRailTool =
  | "text"
  | "design"
  | "scripture"
  | "filters";

type CreatorStudioToolRailProps = {
  activeTool: CreatorStudioRailTool;
  onToolChange: (tool: CreatorStudioRailTool) => void;
  className?: string;
};

const railTools: {
  value: CreatorStudioRailTool;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { value: "text", label: "Text", icon: Type },
  { value: "design", label: "Design", icon: Sparkles },
  { value: "scripture", label: "Scripture", icon: BookOpen },
  { value: "filters", label: "Filters", icon: Palette },
];

export default function CreatorStudioToolRail({
  activeTool,
  onToolChange,
  className = "",
}: CreatorStudioToolRailProps) {
  return (
    <aside
      className={`flex w-16 shrink-0 flex-col items-center gap-2 border-r border-white/10 bg-[#031d3d] py-4 ${className}`}
      aria-label="Creator Studio tools"
    >
      {railTools.map((tool) => {
        const Icon = tool.icon;
        const active = activeTool === tool.value;

        return (
          <button
            key={tool.value}
            type="button"
            onClick={() => onToolChange(tool.value)}
            aria-label={tool.label}
            aria-pressed={active}
            title={tool.label}
            className={`flex w-12 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[9px] font-bold transition ${
              active
                ? "bg-white/15 text-white ring-1 ring-white/20"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="leading-none">{tool.label}</span>
          </button>
        );
      })}
    </aside>
  );
}

export function CreatorStudioMobileToolbar({
  activeTool,
  onToolChange,
  embedded = false,
}: {
  activeTool: CreatorStudioRailTool;
  onToolChange: (tool: CreatorStudioRailTool) => void;
  embedded?: boolean;
}) {
  return (
    <div
      className={
        embedded
          ? "px-1 pt-2"
          : "pointer-events-auto fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#031d3d]/96 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden"
      }
    >
      <div className="mx-auto flex max-w-lg items-center justify-around gap-1">
        {railTools.map((tool) => {
          const Icon = tool.icon;
          const active = activeTool === tool.value;

          return (
            <button
              key={tool.value}
              type="button"
              onClick={() => onToolChange(tool.value)}
              aria-label={tool.label}
              aria-pressed={active}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-bold transition ${
                active
                  ? "bg-white/15 text-white"
                  : "text-white/65 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate">{tool.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function mapRailToolToEditorPanel(
  tool: CreatorStudioRailTool
): "text" | "fonts" | "colors" | "ai" | "scripture" | "advanced" {
  if (tool === "design") return "ai";
  if (tool === "scripture") return "scripture";
  if (tool === "filters") return "colors";
  return "fonts";
}
