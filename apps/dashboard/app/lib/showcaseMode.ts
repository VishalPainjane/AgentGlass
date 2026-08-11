/** True when the public demo is served without a live daemon (e.g. Vercel). */
export function isShowcaseMode(): boolean {
  return process.env.NEXT_PUBLIC_SHOWCASE_MODE === "true";
}
