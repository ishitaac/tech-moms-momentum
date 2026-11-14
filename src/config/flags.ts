/** Stretch features. Defaults off; override with FLAG_* env vars (see .env.example). */

const DEFAULTS = {
  boardMembers: false,
  aiDraft: false,
  fullDashboard: false,
  weightTuning: false,
} as const;

export type FlagName = keyof typeof DEFAULTS;

const ENV_KEYS: Record<FlagName, string> = {
  boardMembers: "FLAG_BOARD_MEMBERS",
  aiDraft: "FLAG_AI_DRAFT",
  fullDashboard: "FLAG_FULL_DASHBOARD",
  weightTuning: "FLAG_WEIGHT_TUNING",
};

export function isEnabled(flag: FlagName): boolean {
  const raw = process.env[ENV_KEYS[flag]];
  if (raw === "true") return true;
  if (raw === "false") return false;
  return DEFAULTS[flag];
}

export function allFlags(): Record<FlagName, boolean> {
  return Object.fromEntries(
    (Object.keys(DEFAULTS) as FlagName[]).map((f) => [f, isEnabled(f)]),
  ) as Record<FlagName, boolean>;
}
