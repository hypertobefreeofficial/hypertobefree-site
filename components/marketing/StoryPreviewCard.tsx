"use client";

import { motion } from "framer-motion";
import { Globe2, Play } from "lucide-react";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";

export type StoryPreview = {
  type: string;
  title: string;
  location: string;
  tag: string;
};

type StoryPreviewCardProps = {
  story: StoryPreview;
  index?: number;
};

export function StoryPreviewCard({ story, index = 0 }: StoryPreviewCardProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: "easeOut" }}
      whileHover={{ y: -4 }}
    >
      <Card className="h-full overflow-hidden p-5 transition-shadow duration-300 hover:shadow-lg hover:shadow-blue-950/5">
        <div className="mb-5 flex items-center justify-between gap-2">
          <Badge variant="blue">{story.type}</Badge>
          <Badge variant="amber">{story.tag}</Badge>
        </div>

        <div className="mb-4 flex h-40 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-htbf-mist via-white to-[#fff0cf] p-4">
          <div className="flex h-full w-full items-center justify-center rounded-[1.2rem] border border-white bg-white/60">
            <Play className="h-10 w-10 fill-htbf-blue text-htbf-blue" aria-hidden />
          </div>
        </div>

        <h3 className="font-heading text-lg font-black leading-snug text-slate-900 sm:text-xl">
          {story.title}
        </h3>

        <div className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-500">
          <Globe2 className="h-4 w-4 shrink-0" aria-hidden />
          {story.location}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {["Amen", "Praise God", "This encouraged me"].map((label) => (
            <Badge key={label} variant="muted" className="py-1.5">
              {label}
            </Badge>
          ))}
        </div>
      </Card>
    </motion.article>
  );
}
