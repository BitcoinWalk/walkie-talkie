type Listener = (accountPubkey: string) => void;
const listeners = new Set<Listener>();

/** Local invalidation only. The inbox still reads membership from the relay. */
export function communityMembershipChanged(accountPubkey: string): void {
  for (const listener of listeners) listener(accountPubkey);
}

export function subscribeCommunityMembershipChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
