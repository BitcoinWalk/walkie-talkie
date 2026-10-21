import type { ProximityTransportPort } from '@/platform/ports/proximity-transport';
import { NearbyReadinessController } from '../nearby-readiness';

function fixture() {
  const remove = jest.fn();
  const port = {
    isAvailable: jest.fn(() => true),
    requestPermissions: jest.fn(async () => true),
    getBluetoothStateAsync: jest.fn(async () => 'poweredOff'),
    addListener: jest.fn(() => ({ remove })),
    startScanAsync: jest.fn(), startAdvertisingAsync: jest.fn(),
  } as unknown as jest.Mocked<ProximityTransportPort>;
  const state = jest.fn();
  return { port, state, remove, controller: new NearbyReadinessController(port, state) };
}

describe('open Nearby readiness isolation', () => {
  it('does nothing until an explicit check, never scans or advertises', async () => {
    const { port, state, controller } = fixture();
    expect(port.requestPermissions).not.toHaveBeenCalled();
    await controller.check();
    expect(state.mock.calls.map(([value]) => value)).toEqual(['checking', 'poweredOff']);
    expect(port.startScanAsync).not.toHaveBeenCalled();
    expect(port.startAdvertisingAsync).not.toHaveBeenCalled();
  });

  it('does not touch Bluetooth after denied permission', async () => {
    const { port, state, controller } = fixture();
    port.requestPermissions.mockResolvedValue(false);
    await controller.check();
    expect(state).toHaveBeenLastCalledWith('unauthorized');
    expect(port.getBluetoothStateAsync).not.toHaveBeenCalled();
  });

  it('does not request permission on foreground recheck', async () => {
    const { port, controller } = fixture();
    await controller.check(false);
    expect(port.requestPermissions).not.toHaveBeenCalled();
  });

  it('fails honestly on an old binary or unsupported platform', async () => {
    const { port, state, controller } = fixture();
    delete port.getBluetoothStateAsync;
    await controller.check();
    expect(state).toHaveBeenLastCalledWith('unsupported');
    expect(port.requestPermissions).not.toHaveBeenCalled();
  });

  it('ignores a late permission result after leaving or switching account', async () => {
    const { port, state, controller } = fixture();
    let resolve!: (value: boolean) => void;
    port.requestPermissions.mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = controller.check();
    controller.cancel();
    resolve(true);
    await pending;
    expect(state).toHaveBeenCalledTimes(1);
    expect(port.getBluetoothStateAsync).not.toHaveBeenCalled();
  });

  it('coalesces repeated taps and removes state listeners on leave', async () => {
    const { port, remove, controller } = fixture();
    await Promise.all([controller.check(), controller.check()]);
    expect(port.requestPermissions).toHaveBeenCalledTimes(1);
    controller.cancel();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('recovers after an error', async () => {
    const { port, state, controller } = fixture();
    jest.mocked(port.getBluetoothStateAsync!).mockRejectedValueOnce(new Error('radio failure'));
    await controller.check();
    expect(state).toHaveBeenLastCalledWith('error');
    await controller.check();
    expect(state).toHaveBeenLastCalledWith('poweredOff');
  });
});
