import type { PlatformAdapters } from '../ports';

let adapters: PlatformAdapters | null = null;
export function initPlatformAdapters(custom: PlatformAdapters): void {
  if (adapters) throw new Error('Extension adapters already initialized');
  adapters = custom;
}
export function getPlatform(): PlatformAdapters {
  if (!adapters) throw new Error('Extension adapters must precede business modules');
  return adapters;
}
