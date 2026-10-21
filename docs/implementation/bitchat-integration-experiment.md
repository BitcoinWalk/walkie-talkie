# BW-145 / BW-147: Bitchat integration experiment

Reviewed: 21 October 2026. Status: parked by user decision after the isolated GPL
evaluation. Walkie Talkie `26.10.27` exposes only a static Bluetooth-mesh
**Coming soon** placeholder; it does not include this experiment or start radio
work. Walkie Talkie integration and physical-device acceptance are NOT complete.
No upstream code has been imported into Walkie Talkie, no production license
changed, and no evaluation APK published.

## Pinned source and licensing gate

- Android: `permissionlesstech/bitchat-android`, commit
  `adc09f69a383659ceead7000d4187556fa18a9ac`, checked in a separate source checkout.
  `LICENSE.md` contains GPL version 3; `README.md` line 30 instead claims public
  domain. No additional license/notice file or permissive source header was found
  in the mesh/protocol directories checked. This is a scoped inspection, not a
  complete dependency or provenance audit.
- Apple: `permissionlesstech/bitchat`, commit
  `5e9287fae1e5fea80ca741d4ea669829dc16f144`, root `LICENSE` is the Unlicense.
  This does not establish that the separate Android code has the same license.
- Walkie Talkie's current root license is MIT, with upstream copyright notices
  that must remain intact.

Treat Android source reuse as GPL-covered unless the relevant rights holders
clarify otherwise. Do not infer permission to distribute an MIT-only combined
application from the README. Private evaluation can remain separate; production
reuse requires an explicit licensing decision and dependency compatibility review.
Options: a GPL-compliant combined distribution, appropriate upstream permission,
or a separately assessed implementation based on permissively licensed material.
No maintainer has been contacted and no legal determination is claimed.

Sources:
- https://github.com/permissionlesstech/bitchat-android/blob/adc09f69a383659ceead7000d4187556fa18a9ac/LICENSE.md
- https://github.com/permissionlesstech/bitchat-android/blob/adc09f69a383659ceead7000d4187556fa18a9ac/README.md
- https://github.com/permissionlesstech/bitchat/blob/5e9287fae1e5fea80ca741d4ea669829dc16f144/LICENSE

## Integration boundary

Keep the current Nearby row and explicit user opt-in. Assess a native adapter
around Bitchat mesh events, peer lifecycle, nickname, broadcast send and stop.
The Android coordinator is `BluetoothMeshService`, not an independently published
React Native SDK: it references crypto, routing, sync, notifications and other app
services. Its Gradle settings include app and wear modules, not a standalone mesh
library. Extraction and lifecycle isolation are still engineering work.

Do not replace NIP-29 City/Global/Hosts, DMs, account storage or private Nearby.
Do not reuse the custom experimental wire format as Bitchat packets. Custom link
work is paused and unconnected to production. Preserve the preview until actual
radio integration works. Reusing a display name must not imply verified Nostr
identity; that requires a separately verified binding.

Bitchat's documented public mesh exposes stable peer identity and nicknames and
can synchronize public history. This differs from the previous no-identifying-
discovery/no-historical-replay proposal. Resolve and disclose these semantics
before enabling user participation. Nearby must not silently publish to internet
relays. Disable internet fallback and Wi-Fi Aware for BLE-only acceptance.

## Available evidence

- Device discovery succeeded, but found zero connected Android test devices.
- Existing Walkie Talkie `:expo-proximity:compileDebugKotlin` completed successfully
  with Java 17 and the existing Android SDK. This verifies our readiness module,
  NOT Bitchat integration, APK assembly, iOS compilation or radio delivery.
- Pinned Bitchat Android requires JDK 21 and SDK/build tools 37. The initially
  missing toolchain has now been installed separately for evaluation; see build
  evidence below. This does not establish phone compatibility or forwarding.
- No two-phone or three-phone test has run. Unit tests cannot substitute for them.

## Physical acceptance procedure

Use dedicated test identities/names and synthetic text. Keep raw traces local.
Record pinned source commits, app versions, APK hashes, phone model/OS, permission
state and transport state; do not publish serial numbers, identities or messages.
Do not collect location. Phones must be unlocked with Bluetooth permissions granted.

1. **Stock baseline:** two stock Bitchat clients, airplane mode with Bluetooth
   manually enabled, Wi-Fi/mobile data and Wi-Fi Aware disabled. Send 20 unique
   numbered messages in each direction. Record received IDs, duplicates, failures
   and latency; verify nicknames and reconnect after Bluetooth off/on. A baseline
   pass alone does not establish Walkie Talkie compatibility.
2. **Integrated two-phone:** replace A with the isolated Walkie Talkie experimental
   build and repeat. Verify explicit Join/Leave, no radio work before Join, no
   queued send after Leave/account switch, guest participation, and unchanged
   online/private chats. Required before claiming interoperability.
3. **Three-phone forwarding:** A (experimental), B (stock forwarder), C (stock).
   Establish A–B and B–C links but no A–C link, using physical separation/shielding
   and connection evidence. With B off, a fresh unique A message must not reach C
   during the observation window. With B on, send new numbered messages A→C and
   C→A; capture evidence of relay via B. Repeat B-off/B-on with new IDs to avoid
   mistaking cached history synchronization for live forwarding. If direct A–C
   reachability cannot be excluded, mark the result inconclusive, not passed.
4. **Cross-platform follow-up:** Android/iPhone offline bidirectional messaging;
   then a mixed three-phone topology. Android-only evidence is not iPhone approval.

Acceptance: all 20 messages per direction delivered once within a declared
60-second foreground window in each controlled run; retain any miss as a failure
to investigate, not a hidden retry. Report actual latency rather than promising
range or background reliability. Leave stops the experimental room's radio work
without terminating existing private sessions. Public messages are not confidential.

## Isolated evaluation build

Current artifact: `2.0.2-bw-eval.2` (40), superseding revision 1 below. The user
reported installation failure with stock Bitchat installed. Inspection found a
duplicate signature permission retained from upstream. Revision 2 scopes the
manifest declaration/request and runtime sender/receiver permission to the
installed application ID. The evaluation package and signing certificate remain
unchanged; stock Bitchat must not be uninstalled or have its data cleared.
Build and all 17 focused tests pass, including two permission-isolation tests.
Final APK inspection confirms no original stock shutdown permission, signature
protection retained, signature verification and alignment pass. Universal SHA-256:
`1a922ebbaae248998f0c35af33901b7c39362c38900402d884dc4e383c916ce2`.
The user confirmed on 21 October 2026 that revision 2 installs successfully
alongside stock Bitchat. Package/signature-permission coexistence is therefore
accepted. No physical test phones are connected to the development host yet, so
offline delivery, Bluetooth reconnect and controlled three-phone forwarding
remain pending.

### Revision 1 baseline (superseded; do not install)

The user approved a separate GPL evaluation and will arrange phones. Baseline
source remains pinned to Android commit `adc09f69a383659ceead7000d4187556fa18a9ac`.
The standalone debug package is `com.bitchat.droid.bitcoinwalk.eval`, label
`Bitchat GPL Eval`, version `2.0.2-bw-eval.1`, code 39. It has its own disposable
debug key and cannot replace either production installation. The evaluation's
phone lab harness targets its package, not stock Bitchat. Mesh protocol is unchanged.

Build passed with JDK 21.0.12.1+1 and the checksum-verified upstream Android 37
archives. This substitutes a downloadable JDK 21 patch for unavailable 21.0.11+10;
it is not claimed to be an upstream reproducible release. APK v2 signature,
package/version/launcher labels and 16 KiB alignment were verified. The universal
APK SHA-256 is `fa5975bd6696f104ed5316e887e1d712b8878909ca2c4152a43a80da73998e99`.
All 15 focused JVM tests passed (4 routing, 7 fragmentation, 4 packet utilities),
zero failures/skips. The full upstream suite has not run; simulated routing is
not evidence of physical forwarding.

Source and APK preparation do not enable a mesh inside Walkie Talkie. Test only
synthetic identities: the upstream debug receiver is exported and the artifact
is lab-only. No physical tests, device installs, upload or production changes
have occurred. Next: two-phone baseline and controlled three-phone forwarding
when phones are available, then a separately reviewed native adapter. Production
GPL reuse/licensing and the privacy-semantic changes remain gated.
