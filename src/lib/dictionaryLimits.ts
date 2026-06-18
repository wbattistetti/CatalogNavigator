/**
 * Thresholds for deferring heavy dictionary work off the critical UI path.
 */

/** Above this active token count, skip synchronous corpus segmentation during render. */
export const LARGE_DICTIONARY_TOKEN_THRESHOLD = 1500;
