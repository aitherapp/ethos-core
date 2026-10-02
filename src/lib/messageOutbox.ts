export type OutboxEntry = {
  id: string;
  peerId: string;
  text: string;
  ephemeral?: boolean;
  createdAt: number;
};

export function enqueueOutbox(queue: OutboxEntry[], entry: OutboxEntry): OutboxEntry[] {
  return [...queue, entry];
}

export function removeOutbox(queue: OutboxEntry[], id: string): OutboxEntry[] {
  const next = queue.filter((item) => item.id !== id);
  if (next.length === queue.length) {
    return [...queue];
  }
  return next;
}

export function listOutboxForPeer(queue: OutboxEntry[], peerId: string): OutboxEntry[] {
  return queue.filter((item) => item.peerId === peerId);
}
