/** Theme choice lives on <html data-theme>; only CSS tokens change (see globals.css). */
export const THEME_STORAGE_KEY = "ff-theme";
export type Theme = "default" | "contrast";

/**
 * Runs before first paint (inlined in the root layout) so a saved theme never flashes.
 * Without a saved choice, nothing is set and the OS "more contrast" setting applies.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="contrast"||t==="default")document.documentElement.dataset.theme=t}catch(e){}`;
