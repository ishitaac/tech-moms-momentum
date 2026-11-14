/**
 * AI touchpoints (PRD §AI requirements). The model reads and rates; it never decides.
 * Guardrails: public text only, quoted evidence must appear verbatim in the source,
 * otherwise the field is "unknown". Usage is recorded on the meter for the cost panel.
 */
import { generateText, Output } from "ai";
import { convert } from "html-to-text";
import { z } from "zod";
import { getModel, modelId, type UsageMeter } from "./provider";

const MAX_PAGE_CHARS = 12_000;
const FETCH_TIMEOUT_MS = 15_000;
const LIKELY_GRANT_PATHS = ["grants", "apply", "funding", "giving", "community", "foundation"];

const MISSION_PROMPT = `You rate how well a funder's stated purpose aligns with Tech-Moms:
a Utah nonprofit that helps mothers return to the workforce or pivot careers through tech training
(coding, digital skills, career coaching).

Anchored scale:
0 = no overlap (e.g. arts, animal welfare, medical research only)
1 = adjacent (general education, general community support, youth programs)
2 = strong overlap on one axis (workforce development OR women's economic empowerment OR tech education)
3 = direct fit (workforce/career programs for women, or tech training for adults returning to work)

Use only the text provided. Quote the phrase that most supports your rating, copied exactly.`;

const missionSchema = z.object({
  rating: z.number().int().min(0).max(3),
  quote: z.string().max(300),
});

export async function rateMission(text: string, meter: UsageMeter): Promise<{ rating: number; quote: string; model: string } | null> {
  const input = text.slice(0, MAX_PAGE_CHARS);
  if (input.trim().length < 40) return null;
  const result = await generateText({
    model: getModel("extract"),
    system: MISSION_PROMPT,
    prompt: input,
    output: Output.object({ schema: missionSchema }),
  });
  meter.record("extract", result.usage);
  const out = result.output;
  if (!out || !quoteAppears(out.quote, input)) return null;
  return { ...out, model: modelId("extract") };
}

const OPEN_CALL_PROMPT = `Read this funder web page text. Determine ONLY from the text whether there is a
currently open grant call or application window. Never guess.

- isOpen: "open" only if the page states applications/LOIs are currently accepted or gives a future deadline; otherwise "unknown".
- deadline: YYYY-MM-DD if a specific date is stated, else null.
- route: "loi" if a letter of inquiry/intent is the first step, "direct" if a full application, else "unknown".
- awardMin/awardMax: numbers in USD if stated, else null.
- quote: the exact sentence that supports isOpen/deadline, copied verbatim (empty if unknown).`;

const openCallSchema = z.object({
  isOpen: z.enum(["open", "unknown"]),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  route: z.enum(["loi", "direct", "unknown"]),
  awardMin: z.number().nullable(),
  awardMax: z.number().nullable(),
  quote: z.string().max(400),
});
export type OpenCallExtraction = z.infer<typeof openCallSchema> & { sourceUrl: string };

export function quoteAppears(quote: string, source: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const q = norm(quote);
  return q.length > 0 && norm(source).includes(q);
}

export async function fetchPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FunderFinder/0.1; nonprofit research)" },
      redirect: "follow",
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) return null;
    const html = await res.text();
    const text = convert(html, { wordwrap: false, selectors: [{ selector: "a", options: { ignoreHref: true } }, { selector: "img", format: "skip" }] });
    return text.replace(/\n{3,}/g, "\n\n").slice(0, MAX_PAGE_CHARS);
  } catch {
    return null;
  }
}

/** Candidate pages: homepage + same-site links whose path looks grant-related (max 2). */
export async function grantPages(website: string): Promise<string[]> {
  const base = website.startsWith("http") ? website : `https://${website}`;
  const pages = [base];
  try {
    const res = await fetch(base, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "follow" });
    const html = await res.text();
    const origin = new URL(res.url).origin;
    const links = [...html.matchAll(/href="([^"#]+)"/g)]
      .map((m) => {
        try {
          return new URL(m[1], origin).toString();
        } catch {
          return null;
        }
      })
      .filter((u): u is string => !!u && u.startsWith(origin) && LIKELY_GRANT_PATHS.some((p) => u.toLowerCase().includes(p)));
    pages.push(...[...new Set(links)].slice(0, 2));
  } catch {
    // homepage unreachable: caller records "unknown"
  }
  return pages;
}

export async function detectOpenCall(url: string, meter: UsageMeter): Promise<OpenCallExtraction | null> {
  const text = await fetchPageText(url);
  if (!text) return null;
  const result = await generateText({
    model: getModel("extract"),
    system: OPEN_CALL_PROMPT,
    prompt: text,
    output: Output.object({ schema: openCallSchema }),
  });
  meter.record("extract", result.usage);
  const out = result.output;
  if (!out) return null;
  // Never guess: an "open" claim must be backed by a verbatim quote from the page.
  if (out.isOpen === "open" && !quoteAppears(out.quote, text)) {
    return { ...out, isOpen: "unknown", deadline: null, sourceUrl: url };
  }
  return { ...out, sourceUrl: url };
}

const POLISH_PROMPT = `Rewrite these facts as one plain sentence (max 30 words) explaining why this
funder may fit Tech-Moms. Do not add any fact, number or name that is not in the input.`;

export async function polishReason(facts: string, meter: UsageMeter): Promise<string | null> {
  const result = await generateText({ model: getModel("explain"), system: POLISH_PROMPT, prompt: facts });
  meter.record("explain", result.usage);
  return result.text?.trim() || null;
}
