export type WidgetOutboundResult =
  | { ok: true; messageId: string }
  | { ok: false };

export type DeliverWidgetOutboundDeps = {
  isTransportUsable: () => boolean;
  wake: (messageId: string) => Promise<boolean>;
  send: () => Promise<{ id: string } | null>;
  /** Drop zombie relay/"usable" state so we wait for a live post-wake session. */
  prepareForRetry?: () => void;
  waitMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Push is wake-only — ciphertext must use a live session with the woken peer.
 * Never send-first on a local "relay connected" flag: that is often a zombie while
 * the owner phone sleeps, which orphans the notification (push arrives, chat empty).
 */
export async function deliverWidgetOutbound(
  deps: DeliverWidgetOutboundDeps
): Promise<WidgetOutboundResult> {
  const waitMs = deps.waitMs ?? 15_000;
  const pollMs = deps.pollMs ?? 500;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  await deps.wake(`widget-wake-${Date.now()}`);
  deps.prepareForRetry?.();

  const deadline = Date.now() + waitMs;
  while (!deps.isTransportUsable() && Date.now() < deadline) {
    await sleep(pollMs);
  }

  const sent = await deps.send();
  if (sent) {
    // Second wake carries the real message id so notification clicks can deep-link.
    await deps.wake(sent.id);
    return { ok: true, messageId: sent.id };
  }
  return { ok: false };
}
