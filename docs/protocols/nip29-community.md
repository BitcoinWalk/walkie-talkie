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
`bitcoinwalk-<city-slug>` group ID. A legacy dedicated destination may remain
readable only during its verified migration. An incomplete city has no city destination; the
Global group remains a separate conversation and is never relabelled as that
city's room.

## Current client behavior

- Read group metadata with kind `39000` and the exact `d` tag.
- Read and live-subscribe to at most 200 kind `9` messages with the exact `h`
  tag. Deduplicate by signed event ID and order by signed timestamp plus ID.
- Show the selected city group first and BitcoinWalk Global second in Chats.
  The city avatar centre-crops the city's approved OG artwork.
- On the first authenticated launch for an account and destination, submit a
  kind `9021` join through the existing signer. Remote signers such as Amber may
  ask the user to approve each request. Remember only successful or duplicate
  joins locally so later launches do not ask again.
- A relay `duplicate:` response means the connected identity is already a
  member.
- Post kind `9` messages only after the explicit join action. Include up to
  three recent, other-author event prefixes in the `previous` tag.
- Use the existing account signer, including NIP-46, and the existing managed
  relay pool. The signer remains responsible for relay authentication during
  publication.

Public community messages intentionally remain outside the encrypted
private-message database. Profile hydration, offline history and notification
delivery are later slices.
