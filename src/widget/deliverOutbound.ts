export type WidgetOutboundResult =
  | { ok: true; messageId: string }
  | { ok: false };

export type DeliverWidgetOutboundDeps = {
  isTransportUsable: () => boolean;
  wake: (messageId: string) => Promise<boolean>;
  send: () => Promise<{ id: string } | null>;
  waitMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Push is wake-only — ciphertext still needs a live direct/relay tunnel.
 * If the first send misses (owner asleep), wake → wait for usable transport → retry once.
 */
export async function deliverWidgetOutbound(
  deps: DeliverWidgetOutboundDeps
): Promise<WidgetOutboundResult> {
  const waitMs = deps.waitMs ?? 15_000;
  const pollMs = deps.pollMs ?? 500;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  let sent = await deps.send();
  if (sent) {
    await deps.wake(sent.id);
    return { ok: true, messageId: sent.id };
  }

  await deps.wake(`widget-wake-${Date.now()}`);

  const deadline = Date.now() + waitMs;
  while (!deps.isTransportUsable() && Date.now() < deadline) {
    await sleep(pollMs);
  }

  sent = await deps.send();
  if (sent) {
    // Second wake carries the real message id so notification clicks can deep-link.
    await deps.wake(sent.id);
    return { ok: true, messageId: sent.id };
  }
  return { ok: false };
}
