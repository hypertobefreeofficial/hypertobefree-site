"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Card, CardDescription, CardHeader, CardTitle } from "../ui/card";

type FeatureInfoCardProps = {
  icon: React.ReactNode;
  title: string;
  text: string;
  index?: number;
};

export function FeatureInfoCard({
  icon,
  title,
  text,
  index = 0,
}: FeatureInfoCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.4, delay: index * 0.07 }}
      whileHover={{ y: -3 }}
    >
      <Card className="h-full border-slate-200 p-7 transition-shadow duration-300 hover:shadow-md">
        <div className="mb-4 text-htbf-blue">{icon}</div>
        <CardHeader className="p-0">
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription className="mt-3 text-base leading-7">{text}</CardDescription>
        </CardHeader>
      </Card>
    </motion.div>
  );
}
