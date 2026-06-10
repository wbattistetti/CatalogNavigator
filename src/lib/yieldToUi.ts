/**
 * Yields to the browser so React can paint and CSS animations can run
 * before heavy synchronous work continues.
 */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
