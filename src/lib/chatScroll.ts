const DEFAULT_BOTTOM_THRESHOLD = 64;

export function isNearScrollBottom({
  scrollTop,
  clientHeight,
  scrollHeight,
  threshold = DEFAULT_BOTTOM_THRESHOLD,
}: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  threshold?: number;
}) {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}
