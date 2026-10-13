# BitcoinWalk NIP-29 communities

Walkie Talkie treats the public BitcoinWalk city community as a separate
protocol surface from its inherited encrypted direct and private group chats.
Public communities are relay-readable NIP-29 groups and must never be described
as end-to-end encrypted.

## Destination authority

The app accepts a community only from BitcoinWalk's versioned `/api/cities`
projection. The projection must contain a verified `wss` relay and group ID.
The mobile parser permits only the shared BitcoinWalk community relay for a
global migration destination and the selected city's canonical BitcoinWalk
relay for a city destination. A Pro city with incomplete or disabled Walkie
Talkie provisioning has no destination and never falls back to the global room.

## Current client behavior

- Read group metadata with kind `39000` and the exact `d` tag.
- Read and live-subscribe to at most 200 kind `9` messages with the exact `h`
  tag. Deduplicate by signed event ID and order by signed timestamp plus ID.
- Join explicitly with kind `9021`; a relay `duplicate:` response means the
  connected identity is already a member.
- Post kind `9` messages only after the explicit join action. Include up to
  three recent, other-author event prefixes in the `previous` tag.
- Use the existing account signer, including NIP-46, and the existing managed
  relay pool. The signer remains responsible for relay authentication during
  publication.

This first native slice intentionally keeps public community messages out of
the encrypted private-message database. Durable membership-list publication,
profile hydration, offline history and notification delivery are later slices.
