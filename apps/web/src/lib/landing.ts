// Landing page values that need a real answer from Khalid before they show.
// Each one is null until filled in, and its piece of the page stays hidden
// while it is null, so nothing here can publish a guess.

/**
 * PLACEHOLDER: average events recorded per visit, from real data.
 * When set, each plan's event limit gets a line like "≈ 33,000 visits a month".
 */
export const EVENTS_PER_VISIT: number | null = null;

/**
 * PLACEHOLDER: naira per US dollar, for the "≈ $X/mo" line under paid plans.
 * Leave null to show naira only.
 */
export const NGN_PER_USD: number | null = null;

/**
 * PLACEHOLDER: walkthrough video. A YouTube/Vimeo embed URL or a direct .mp4 link.
 * When set, it shows above the live demo preview.
 */
export const WALKTHROUGH_VIDEO_URL: string | null = null;
