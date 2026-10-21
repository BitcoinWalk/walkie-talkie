import { parseMessageSegments } from '@/lib/text/message-segments';

export type ActiveMention = {
  start: number;
  end: number;
  query: string;
};

/** The @token immediately before the caret, if the user is composing one. */
export function activeMentionAt(text: string, caret: number): ActiveMention | null {
  const safeCaret = Math.max(0, Math.min(caret, text.length));
  const beforeCaret = text.slice(0, safeCaret);
  const match = beforeCaret.match(/(^|\s)@([^\s@]*)$/);
  if (!match) return null;
  const prefixLength = match[1].length;
  const start = safeCaret - match[0].length + prefixLength;
  return { start, end: safeCaret, query: match[2] };
}

/** Replace the active @token with the canonical Nostr profile reference. */
export function insertMentionReference(
  text: string,
  caret: number,
  npub: string,
): { text: string; caret: number } | null {
  const active = activeMentionAt(text, caret);
  if (!active) return null;
  const reference = `nostr:${npub}${/\s/.test(text[active.end] ?? '') ? '' : ' '}`;
  const next = text.slice(0, active.start) + reference + text.slice(active.end);
  return { text: next, caret: active.start + reference.length };
}

/** Unique pubkeys referenced by canonical inline Nostr mentions. */
export function mentionedPubkeys(content: string): string[] {
  const seen = new Set<string>();
  for (const segment of parseMessageSegments(content)) {
    if (segment.type === 'mention') seen.add(segment.pubkey);
  }
  return [...seen];
}
