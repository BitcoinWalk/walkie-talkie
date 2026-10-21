import type { BluetoothReadiness, ProximityTransportPort } from '@/platform/ports/proximity-transport';

export type NearbyReadinessState = 'idle' | 'checking' | 'error' | BluetoothReadiness;

/** Readiness only. No discovery, session identity or private-peer approval. */
export class NearbyReadinessController {
  private generation = 0;
  private checking = false;
  private subscription: { remove(): void } | undefined;

  constructor(
    private readonly transport: ProximityTransportPort,
    private readonly onState: (state: NearbyReadinessState) => void,
  ) {}

  async check(requestPermission = true): Promise<void> {
    if (this.checking) return;
    const generation = this.generation;
    const current = () => generation === this.generation;
    this.checking = true;
    this.onState('checking');
    try {
      if (!this.transport.isAvailable() || !this.transport.getBluetoothStateAsync) {
        if (current()) this.onState('unsupported');
        return;
      }
      if (requestPermission && !await this.transport.requestPermissions()) {
        if (current()) this.onState('unauthorized');
        return;
      }
      if (!current()) return;
      if (!this.subscription) this.subscription = this.transport.addListener('onBluetoothState', (event) => {
        if (current() && isBluetoothReadiness(event.state)) this.onState(event.state);
      });
      const state = await this.transport.getBluetoothStateAsync();
      if (current()) this.onState(isBluetoothReadiness(state) ? state : 'unknown');
    } catch {
      if (current()) this.onState('error');
    } finally {
      if (current()) this.checking = false;
    }
  }

  cancel(): void {
    this.generation += 1;
    this.checking = false;
    this.subscription?.remove();
    this.subscription = undefined;
  }
}

function isBluetoothReadiness(value: unknown): value is BluetoothReadiness {
  return typeof value === 'string' && ['unknown', 'resetting', 'unsupported',
    'unauthorized', 'poweredOff', 'poweredOn'].includes(value);
}
