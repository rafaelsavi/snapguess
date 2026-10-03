/**
 * Image Swap Utility.
 *
 * Prevents stale-image flicker by following a strict lifecycle:
 *   1. Immediately hide the current (stale) image
 *   2. Preload the new URL via an off-screen Image() object
 *   3. Only swap the visible <img>.src after onload fires
 *
 * This eliminates the single-frame flash where the browser continues
 * showing the old decoded bitmap while the new URL is loading.
 */

/**
 * Atomically swap an <img> element's source with a loading placeholder.
 * The old image is hidden immediately, the new image is shown only after onload.
 *
 * @param {HTMLImageElement} imgEl - The <img> element to update
 * @param {string} newSrc - The new image URL
 * @param {object} [options]
 * @param {HTMLElement} [options.placeholderEl] - Element to show while loading
 * @param {string} [options.hiddenClass="hidden"] - CSS class for hiding
 * @param {Function} [options.onLoad] - Callback when new image has loaded
 * @returns {Function} cancel — call to abort if the component is torn down
 */
export function swapImageSrc(imgEl, newSrc, {
  placeholderEl = null,
  hiddenClass = "hidden",
  onLoad = null,
} = {}) {
  if (!imgEl) return () => {};

  // 1. Immediately hide old image
  imgEl.classList.add(hiddenClass);

  // 2. Show placeholder (if any)
  if (placeholderEl) placeholderEl.classList.remove(hiddenClass);

  // 3. Cancel any prior pending swap on this element
  if (imgEl._swapAbort) {
    imgEl._swapAbort();
    imgEl._swapAbort = null;
  }

  let cancelled = false;
  const cancel = () => { cancelled = true; };
  imgEl._swapAbort = cancel;

  if (!newSrc) return cancel;

  // 4. Preload off-screen, then swap only after decode completes
  const loader = new Image();

  const onComplete = () => {
    if (cancelled) return;
    imgEl.src = newSrc;
    imgEl.classList.remove(hiddenClass);
    if (placeholderEl) placeholderEl.classList.add(hiddenClass);
    imgEl._swapAbort = null;
    if (onLoad) onLoad();
  };

  loader.onload = onComplete;
  loader.onerror = onComplete; // Show broken image rather than stale content
  loader.src = newSrc;

  return cancel;
}
