# BitcoinWalk NIP-29 communities

Walkie Talkie treats the public BitcoinWalk city community as a separate
protocol surface from its inherited encrypted direct and private group chats.
Public communities are relay-readable NIP-29 groups and must never be described
as end-to-end encrypted.

## Destination authority

The app accepts communities only from BitcoinWalk's versioned `/api/cities`
projection. The projection independently supplies the verified BitcoinWalk
Global destination and the selected city's verified destination. Every city
room uses the shared BitcoinWalk relay with its own canonical
`bitcoinwalk-<city-slug>` group ID. Dedicated paid-city relays remain separate
Armada/Concord destinations; Walkie Talkie neither reads nor replaces them. An
incomplete city has no city destination; the
Global group remains a separate conversation and is never relabelled as that
city's room.

## Current client behavior

- Read group metadata with kind `39000` and the exact `d` tag.
- Read and live-subscribe to at most 200 kind `9` messages and kind `7`
  reactions with the exact `h` tag. Deduplicate by signed event ID and order
  messages by signed timestamp plus ID.
- Chat opens one inbox, with Guide and Global followed by joined city groups.
  City discovery reads the active account's exact membership transitions in
  bounded relay-scoped batches; suggestions are not memberships. The city
  avatar centre-crops the city's approved OG artwork.
- After an anonymous visitor chooses a city, Nostr sign-in is the boundary for
  automatically requesting membership in both that city's room and BitcoinWalk
  Global. The selected walking city is not changed by opening other city chats.
- On the first authenticated launch for an account and destination, read that
  account's own kind `9000`/`9001` membership history first. This deliberately
  triggers NIP-42 authentication before the user signs a fresh kind `9021`
  join. Remote signers such as Amber may ask the user to approve each request.
  Remember only confirmed membership, successful joins, or duplicate joins
  locally so later launches do not ask again.
- Membership filters use exactly one group in `h`, the authenticated account in
  `p`, and a limit no greater than 200. Discovery can batch separate filters in
  one request, but must not combine multiple groups inside one membership filter
  or exceed the shared relay's listener budget.
- A relay `duplicate:` response means the connected identity is already a
  member.
- Post kind `9` messages only after confirmed membership. A reply adds one
  exact `e` tag referencing an existing kind `9` message in the same group.
  Quick reactions use kind `7` with the same exact `h` and `e` target; custom
  reactions may add one validated NIP-30 `emoji` tag. The relay verifies that
  every referenced target already exists inside that group, so a city cannot
  reference another city's timeline.
- The native community composer reuses the private-chat input, attachment tray
  and voice recorder. Media uses ordinary HTTPS links in kind `9` content;
  payment requests use BOLT11 text, and contact cards use `nostr:npub` text.
  These never enter the encrypted private-message outbox or kind-15 pipeline.
- Before sharing, disclose that groups are not end-to-end encrypted and media
  links are publicly accessible, including media shared in Hosts. Bound each
  upload to 20 MiB and each selected batch to ten files, uploaded sequentially.
  Verify membership before uploading, re-encode static photos to remove metadata,
  and validate the media server's returned hash and size. Do not automatically
  fetch media from other group participants; their links require explicit intent.
- Payment request creation uses the existing wallet receive task with a single
  account-bound, expiring in-memory destination handoff. A route cannot nominate
  an arbitrary relay. Check current membership again before publishing an invoice.
- Use the existing account signer, including NIP-46, and the existing managed
  relay pool. The signer remains responsible for relay authentication and the
  membership action; the join is signed only after authentication completes.

Public community messages intentionally remain outside the encrypted
private-message database. Offline history and notification delivery are later
slices.
