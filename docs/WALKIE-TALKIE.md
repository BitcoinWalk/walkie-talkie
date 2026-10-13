# Walkie Talkie — BW-125

BitcoinWalk's city-organized Nostr companion for Android and iOS.
Local foundation: PsstPsst MIT source at b4d286fac02ae545ad1d6de2de26f20c8e268977.
Keep upstream attribution and license notices. This is an initial development checkout,
not a released BitcoinWalk app. Native packaging and upstream update channels must
be changed to BitcoinWalk identities before distributing any binary.

## Product

Primary destinations: My walks, Chats, Nearby, Account. A walk shows local date,
meeting point, route information, host, city chat, invite/share and Bluetooth join.
Hosts and super-admins retain role-scoped access to the existing admin application;
opening a mobile link never grants administrative rights. NIP-46 login and zaps
remain part of the scope.

## Delivery sequence

Distribution decision: Android targets Zapstore as the primary release channel,
with signed APKs for initial device testing; Google Play is outside the current
scope. iOS uses development builds followed by TestFlight. Before Android release,
establish a BitcoinWalk-owned package identifier, protected APK signing key with
recovery backup, release repository and authorized Nostr publisher identity.
Replace the inherited PsstPsst Zapstore metadata before publication; never publish
using upstream's identity or release URLs. Acceptance includes clean installation,
an upgrade preserving accounts/history, and city-page installation links pointing
to the verified Walkie Talkie listing. Publishing credentials are not yet configured.

1. Foundation: preserve upstream source; define city/walk invites and counting
   semantics; inventory native build prerequisites and upstream messaging behavior.
2. First installable Android slice: BitcoinWalk app identity, My walks reading
   the versioned public events feed, walk details and existing NIP-46 login.
   Add iOS development signing/build on a Mac. Feed is a discovery projection;
   verify the signed occurrence and current approval before joining a walk session.
3. Links: implement `/walkie/city/<city-id>?event=<signed-event-id>` on the website
   and mobile router. City-only links resolve the next approved walk; event links
   keep their exact occurrence, including cancelled/ended explanations. Add
   Android App Links and iOS Universal Links after signing IDs are available.
   With no app installed show a useful city/walk page and installation options.
   Preserve the intended destination through login. Roll out automatic city-page
   buttons through a default-off flag once this works. These public links invite
   navigation; private groups require authenticated expiring membership invitations.
4. Chats: ship an explicitly documented supported protocol set. BW-127 is the
   planned standard NIP-17/NIP-44/NIP-59 DM and BitcoinWalk Guide compatibility
   task. Verify Guide receipt and bidirectional text with an independent client,
   including NIP-46 signer permissions and restart deduplication. Guide itself
   is notification-only. Review recovery of messages previously marked unsupported.
   Legacy NIP-04, NIP-29 adapters, Marmot/MLS and emerging protocols need separate
   future tickets tied to actual client/group needs; universal support is not
   a release criterion. NIP-29 city-group support is a core BW-125 deliverable,
   alongside NIP-17 DMs; it is not deferred to broad interoperability work. Upstream
   requires NIP-4E messaging-key extensions; this is an interoperability gap,
   not proof of standard compatibility. Confirm upstream group implementation
   against its protocol and tests (README still says one-to-one), then select a
   supported private group protocol. Existing NIP-29 city rooms need an adapter.
5. Nearby: bridge native authenticated BLE sessions to a consented, time-bounded
   walk session. Prove two-phone messaging first; implement group routing and
   bounded multi-hop forwarding with TTL, deduplication, encrypted payloads and
   reconnect handling separately. Never count remote mesh hops as locally nearby.
6. Counts and reminders: derive unlinkable per-walk participant IDs after an
   authenticated exchange. Persist IDs and the notification marker per walk;
   merge sets from authorized participants rather than summing counters. Display
   'Connected nearby now' and 'Connected during this walk', explicitly as estimates.
   Rotating advertisements/reconnects must not inflate totals. Multiple devices
   and malicious identities prevent a claim of verified human attendance.
   Share aggregate statistics only with consent; no hardware addresses or raw
   location trail. Define retention and deletion before enabling uploads.
7. Acceptance: real Android/iPhone testing for login, invite cold start, Guide DM,
   group membership removal, offline exchange, three-device mesh, duplicate counts,
   restart recovery, OS permission denial and background behavior. Then publish
   install links and enable city-page rollout.

## Current implementation boundary

The first mobile slice adds a Walks tab backed by the production public
`https://bitcoinwalk.org/api/events` feed. It shows upcoming/in-progress walks,
meeting-place time zones, addresses, descriptions, and external details/maps
links. Loading, refresh failure and an empty directory are distinct. This is
read-only: it does not import events into chat membership or authorize hosting.
The feed does not expose city UUIDs, so invite-to-city resolution remains pending.

Mobile app identities now use `org.bitcoinwalk.walkietalkie` (plus `.dev` for
development) and the approved BitcoinWalk icon. The inherited Apple signing team
has been removed. Existing remote-signer onboarding remains in place; device
acceptance is still required. Upstream artwork, remaining translations, notification
infrastructure and release metadata still need a full branding/configuration pass
before distribution. No Zapstore or TestFlight release has been published.

Run `npx jest src/services/bitcoinwalk/__tests__/walks.test.ts --runInBand`
for feed validation and transport tests. Android JavaScript export is not an APK;
a native SDK build and physical-device testing are separate gates.

`src/lib/bitcoinwalk/invites.mjs` supplies validated invite formatting/parsing.
`presence.mjs` is an in-memory counting reducer accepting already-verified direct
BLE observations. It does not authenticate peers, read GPS, persist state, merge
device reports or connect the radio. Those integrations remain explicit work.
Run `node --test tests/bitcoinwalk/core.test.mjs` for the foundation tests.

Bluetooth cannot sense a geographic meeting point by itself. Use on-device
location plus the signed meeting coordinates, or an explicit user walk selection.
The automatic 'another walker is here' notification requires local participation
and a sustained authenticated encounter with a second device. Background discovery
is best-effort, particularly on iOS; foreground Join nearby is the reliable fallback.

References: https://github.com/CodyTseng/psstpsst;
https://docs.expo.dev/versions/v57.0.0/;
https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html
