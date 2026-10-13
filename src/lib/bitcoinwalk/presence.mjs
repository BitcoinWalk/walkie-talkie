/** In-memory reducer prototype. Caller supplies verified walk-scoped BLE sessions.
 * Never pass scan advertisements, hardware addresses, or mesh-forwarded receipts.
 * Production wiring must persist the session-scoped IDs and notification marker.
 */
export class WalkPresence {
  #peers = new Map();
  #notified = false;
  constructor({ eventId, startsAt, endsAt, selfId, capacity = 1000 }) {
    if (!/^[0-9a-f]{64}$/.test(eventId) || !/^[0-9a-f]{64}$/.test(selfId) ||
        !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt ||
        !Number.isInteger(capacity) || capacity < 2 || capacity > 10000) throw new Error('Invalid walk session');
    this.eventId = eventId;
    this.startsAt = startsAt;
    this.endsAt = endsAt;
    this.selfId = selfId;
    this.capacity = capacity;
  }
  record({ eventId, participantId, authenticated, directBluetooth, consent, insideMeetingArea }, now) {
    if (!Number.isFinite(now) || now < this.startsAt || now > this.endsAt || eventId !== this.eventId ||
        !authenticated || !directBluetooth || !consent || !insideMeetingArea ||
        !/^[0-9a-f]{64}$/.test(participantId) || participantId === this.selfId) return false;
    if (!this.#peers.has(participantId) && this.#peers.size >= this.capacity - 1) return false;
    this.#peers.set(participantId, Math.max(now, this.#peers.get(participantId) ?? now));
    return true;
  }
  snapshot(now) {
    if (!Number.isFinite(now)) throw new Error('Invalid clock');
    const inWindow = now >= this.startsAt && now <= this.endsAt;
    const peers = inWindow ? [...this.#peers.values()].filter(last => last <= now && now - last <= 30000).length : 0;
    const notify = peers > 0 && !this.#notified;
    if (notify) this.#notified = true;
    return { nearbyNow: peers > 0 ? peers + 1 : 0, uniqueConnected: this.#peers.size ? this.#peers.size + 1 : 0, notify };
  }
}
