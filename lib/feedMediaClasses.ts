/**
 * Shared media-surface classes for every HTBF feed experience (main Feed,
 * Freedom Feed, and the dedicated Video Feed). Consolidating these guarantees
 * portrait videos and posters render full-bleed — edge-to-edge cover, no black
 * letterbox bars — identically across surfaces.
 *
 * The parent card owns aspect ratio, height, and rounded corners; the frame
 * clips, and the element fills via object-fit: cover.
 */

/** Media frame: fills its parent card, clips overflow, defines a dark base. */
export const FEED_MEDIA_FRAME_CLASS =
  "relative h-full w-full overflow-hidden bg-black";

/**
 * Video / poster element: fills the frame with cover so it crops (never
 * stretches) and never letterboxes. Default focal point is centered; portrait
 * media that crops faces can override object-position per surface.
 */
export const FEED_MEDIA_EL_CLASS =
  "block h-full w-full object-cover object-center";

/**
 * Blurred, scaled copy of the media used to fill the stage behind a centered
 * portrait video (e.g. the desktop Video Feed) so the sides read as premium
 * ambient light instead of hard black bars.
 */
export const FEED_MEDIA_BACKDROP_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl";
