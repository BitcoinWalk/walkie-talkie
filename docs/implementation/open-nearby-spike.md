# BW-145: open Nearby group compatibility spike

Status: Parked by user decision on 21 October 2026. Mobile `26.10.27` keeps the
Nearby entry first in Chat, but it opens a static **Coming soon** screen and performs
no Bluetooth checks, permission requests, scanning, advertising or group work.
BW-147 owns any future implementation/device rollout. The isolated Bitchat evidence
is retained for a later decision; it is not part of this app build.

## Implemented first slice

- Nearby preview pinned before all inbox groups, also without an account or
  loaded directory. The app's existing city-selection entry flow is unchanged.
- Explicit readiness check, denied/off/unknown/unsupported/error states, Android
  user-enable intent, iOS settings guidance and fresh reads after foreground return.
  Permission results are fenced on account switch or leaving. Readiness never
  starts scanning, advertising or private-peer approval.
- Platform-port and native readiness hooks. Older binaries/unsupported adapters
  fail visibly; native changes require a rebuilt binary, not just JavaScript.
- Isolated two-peer signed text harness: retained display names labelled as guest,
  per-receiver challenge, message nonce, signature/origin checks, 120-second expiry,
  2 KiB text/8 KiB wire limits, 256-message session cap, bounded concurrency,
  deduplication and acknowledgement only after persistence.

The harness is NOT connected to BLE, production storage, Nostr relay publication
or the preview screen. It relies on a future authenticated encrypted link and
does not itself encrypt. A supplied name is not verified Nostr identity. The
spike event representation is internal and not an interoperability standard.
Next: reviewed capability-negotiated radio adapter with non-identifying discovery,
guest lifecycle, verified optional Nostr binding and real two-phone acceptance.
Do not expose a working composer or claim a connected room before those land.

Verification: 25 focused inbox/screen/readiness/prototype tests pass, including
light/dark screen cases; 78 existing proximity protocol/name tests pass. TypeScript
and changed-file lint pass. Native compilation and physical-device verification
are separate gates; the two known desktop-helper baseline failures below remain.
Android module compilation initially stopped because no SDK was configured; a
subsequent run using the existing SDK completed `:expo-proximity:compileDebugKotlin`
successfully with Java 17 and Gradle 9.3.1. This is not APK or radio acceptance. iOS compilation
and visual/device QA were not performed. No signing keys, APK or release metadata
were changed.

The user selected a Bitchat integration experiment. Custom wire/link development
is paused; the additional unconnected `open-nearby-link.ts` draft has not been
validated. See [Bitchat licensing and physical test gates](bitchat-integration-experiment.md).
The pinned Android source has conflicting README/public-domain and GPL-3.0 license
statements; production import needs a licensing decision. No test phones are
connected, and no offline or three-phone forwarding test has run.

## Approved experience

One shared **Nearby** room appears first in Chats, above Guide, Global, City and
other groups. It is independent of selected city, Pro status and organizer role.
Anyone using a compatible app may explicitly join, including a guest without a
Nostr account. Merely opening Chat must not start discovery or disclose a profile.
On first participation explain: **Anyone nearby who joins can read what you send.**
Offer **Join Nearby** and **Not now**. It is not invitation-only or confidential.

Leaving or switching Bluetooth off stops discovery, links and pending sends for
this room. A later connection must not silently flush an old unsent draft. Keep
existing City/Global/Hosts/DM behavior and private Nearby conversations intact.
No internet bridge, public relay publication or city filter applies.

## Entry and availability contract

| State | User feedback and action | Safety/acceptance |
|---|---|---|
| Native capability missing | Nearby is unavailable on this device/build | Never pretend scanning started |
| Bluetooth off | Turn on Bluetooth to chat with people nearby; Enable Bluetooth or platform settings guidance | User-controlled system flow, cancel leaves radio work stopped |
| Permission not requested | Explain purpose, then request from user action | No prompt loop on render/focus |
| Permission denied/restricted | Bluetooth access is needed; supported Settings action and Back | No scanning; distinguish radio off from denial |
| Searching | Looking for people nearby, with activity indicator and Leave | Searching is not connected; zero peers is not an error |
| Connected | Reachable participant count; composer available | No exact distance or verified attendance claim |
| Radio lost / suspended | Nearby paused; retain draft, disable Send, offer recovery | No false sent/delivered state |
| Left | Join Nearby | Clear connection state and stop automatic retries |

Use existing theme/components, accessible state announcements and reduced-motion
support. Keep the composer above the keyboard. A loading indicator describes real
work; it must not hide denial, unsupported capability or an indefinite failure.
The design-engineering skill informs immediate feedback and distinct states,
not extra decorative motion.

## Usernames and identity

- Reuse the signed-in profile name, but verify an explicit Nostr-to-session-key
  binding before labelling it Nostr-backed. A profile string alone is not proof.
- Define a domain-separated, expiring binding to the negotiated session identity
  and freshness challenge; reject wrong key, replay, expired or altered proofs.
  Pin the format in a reviewed protocol proposal before implementation.
- Remote signing may need internet or user approval. Failure does not exclude
  the person: allow an explicitly labelled guest/unverified session, never silently
  impersonate their signed-in identity. No private key transfer to peers.
- Guests choose a name and use a local device/session identity; duplicate names
  remain distinguishable with a short identity suffix and profile details.
- Names and optional bounded profile data are exchanged only after an authenticated
  connection. Do not advertise names, npubs, city or location. Do not fetch arbitrary
  remote avatar URLs during offline discovery; cached avatars are optional.
- A Nostr-backed label proves control of a key, not a unique human or NIP-05.
  NIP-05 assurance needs its own current verification and is not inferred offline.
- Account switch leaves the room and clears prior identity/session work. Guest
  sessions must not inherit another account's history or notification preferences.

## Source inventory and incompatibilities

| Existing surface | Evidence | Work needed |
|---|---|---|
| `src/platform/ports/proximity-transport.ts` | Scan, advertise, permission request, send, stop and event listeners | Add queryable radio/permission state and supported user-enable/settings action through ports; keep unsupported devices benign |
| `src/platform/expo/proximity-transport.ts` | Android permission request; no enable action; non-Android permission call returns true | Do not confuse method result with iOS authorization/radio readiness; consume native state |
| `modules/expo-proximity/ios/ExpoProximityModule.swift` and Android counterpart | Native Bluetooth state events including poweredOff | Validate transition/cancel paths on real devices |
| `src/services/proximity/proximity-runtime.service.ts` | Account-scoped start, existing consent/identity, advertises `localProfile()` | Isolate open-room opt-in and guest lifecycle; do not auto-approve existing private peer requests |
| `src/services/proximity/proximity-identity.service.ts` | Separate stored proximity key and generated/display name | Existing key is not a verified Nostr identity; add explicit binding |
| `docs/protocols/nearby-messaging.md` | v1 single-recipient rumors; no multi-hop; stable keys/name in public Profile | New capability/wire contract and privacy-preserving discovery required; no v1 reinterpretation |

Android offers a user-mediated enable request via `ACTION_REQUEST_ENABLE`:
[official setup documentation](https://developer.android.com/develop/connectivity/bluetooth/setup).
It is not the same as permission approval. The iOS adapter must use supported
system guidance and observe powered-on state before starting; verify exact UX on
the signed native build rather than relying on an undocumented Settings URL.

## Spike slices and acceptance

1. **State/consent seam:** model supported, permission, radio and participation
   states independently. Test cancel, denial, repeated tap, foreground return,
   account switch and leaving during a pending start. No Bluetooth activity from
   displaying the pinned row.
2. **Versioned transport proposal:** retain pairwise authenticated encryption;
   negotiate an open-room capability separately from private Nearby v1. Specify
   signed origin, message ID, room-domain separation, byte limits, expiry and
   deduplication. No claim of White Noise/Marmot compatibility for this new room.
3. **Two-phone foreground text:** join without invitations, send both directions,
   show preserved names with correct assurance, disable internet and repeat.
   Test two guests and guest/account across different cities. Stored acknowledgement
   follows durable intake. Limit text size, per-peer rate, connections and total
   queue storage; choose and measure numeric budgets before implementation.
4. **Three-phone topology test:** direct neighbors only first. In A–B–C with A
   unable to reach C, do not claim all participants received A's text. Forwarding
   needs an explicitly reviewed hop/expiry/replay/loop policy and origin validation;
   no uncontrolled rebroadcast. Keep the feature foreground-only until device
   evidence supports more. Remote hops are not a proximity count.
5. **Abuse and lifecycle:** local mute/block, malformed packet, impersonation,
   duplicate labels, replay, flooding, reconnect, app restart and radio off mid-send.
   No automatic historical replay to newcomers; disclose that recipients may retain
   messages and that leaving cannot erase their copies. No global moderation promise.

Required radio evidence: two Android phones initially, Android/iPhone compatibility,
then three phones. Record OS/app versions, exact commit, internet/radio states,
observed delivery and battery/queue behavior. Unit tests and the desktop fake helper
do not prove physical-radio compatibility. APNs is independent of offline delivery.

## Baseline verification — 21 October 2026

Ran the desktop native proximity protocol, core proximity protocol and display-name
test suites with Jest in-band: 82 tests passed, two failed, four snapshots passed.
The two failures are the desktop helper capability probe and restart tests:
`Proximity module exited (0)` before initialization succeeds. Cause remains
undetermined; this is not evidence of a phone Bluetooth failure. No physical-radio
test has been performed. Main backlog generation and whitespace checks pass.

Invitation-only Marmot/MLS remains BW-127/BW-146. It does not gate this public
Nearby spike and must not be silently replaced by its open admission policy.
