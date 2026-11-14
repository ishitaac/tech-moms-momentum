/**
 * Utah state listing pages (curated in src/config/utah-sources.ts), read by the AI step.
 * Each extracted listing must have its title found verbatim on the page, or it is dropped.
 */
import { generateText, Output } from "ai";
import { createHash } from "node:crypto";
import { z } from "zod";
import { UTAH_SOURCES } from "@/config/utah-sources";
import { fetchPageText, quoteAppears } from "@/lib/ai/extract";
import { getModel, isAiConfigured } from "@/lib/ai/provider";
import type { Opportunity, SourceAdapter, SourceError } from "./types";

const PROMPT = `This is a Utah state agency page listing grant opportunities. Extract each listed grant.
Use only the page text; never guess.
- title: exactly as written on the page
- description: one sentence from the page
- deadline: YYYY-MM-DD if a date is stated, else null
- route: "loi" if a letter of intent/inquiry is required first, "direct" if an application, else "unknown"
- awardMin/awardMax: USD numbers if stated, else null`;

const schema = z.object({
  grants: z.array(
    z.object({
      title: z.string(),
      description: z.string().nullable(),
      deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      route: z.enum(["loi", "direct", "unknown"]),
      awardMin: z.number().nullable(),
      awardMax: z.number().nullable(),
    }),
  ),
});

const id = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);

export const utahPagesAdapter: SourceAdapter = {
  id: "utah-pages",
  label: "Utah state listings",
  async fetch() {
    const errors: SourceError[] = [];
    const items: Opportunity[] = [];
    const today = new Date().toISOString().slice(0, 10);

    if (!isAiConfigured()) {
      return { items, errors: [{ source: "utah-pages", message: "Needs AI to read Utah pages (AI is off)" }], fetchedAt: new Date() };
    }

    for (const src of UTAH_SOURCES.filter((s) => !s.manual)) {
      const text = await fetchPageText(src.url);
      if (!text) {
        errors.push({ source: "utah-pages", message: "Page unreachable", url: src.url });
        continue;
      }
      try {
        const { output } = await generateText({
          model: getModel("extract"),
          system: PROMPT,
          prompt: text,
          output: Output.object({ schema }),
        });
        for (const g of output?.grants ?? []) {
          if (!quoteAppears(g.title, text)) continue;
          items.push({
            externalId: `utah:${id(src.url + g.title)}`,
            funderName: src.agency,
            funderType: "state",
            title: g.title,
            description: g.description,
            eligibility: null,
            geography: "State of Utah",
            awardMin: g.awardMin,
            awardMax: g.awardMax,
            deadline: g.deadline,
            isOpen: g.deadline && g.deadline >= today ? "open" : "unknown",
            route: g.route,
            sourceUrl: src.url,
            website: src.url,
          });
        }
      } catch (err) {
        errors.push({ source: "utah-pages", message: String(err).slice(0, 200), url: src.url });
      }
    }
    return { items, errors, fetchedAt: new Date() };
  },
};
