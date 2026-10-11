import { requireOptionalNativeModule } from 'expo-modules-core';

export type LocalNotificationsModule = {
  setActiveConversationAsync?(account: string | null, conversation: string | null): Promise<void>;
  sharedKeychainGroup?: string;
  notificationProcessorVersion?: number;
  sharedDatabaseDirectoryAsync?(legacyDirectory: string): Promise<string>;
  hasPermissionAsync(): Promise<boolean>;
  ensurePermissionAsync(channelName: string): Promise<boolean>;
  presentAsync(title: string, subtitle: string | null, body: string | null, avatarPath: string | null, badgeCount: number): Promise<boolean>;
  presentCommunicationAsync?(title: string, subtitle: string | null, body: string | null, avatarPath: string | null, badgeCount: number, communication: string): Promise<boolean>;
  dismissAllAsync(): Promise<void>;
  setBadgeCountAsync(count: number): Promise<boolean>;
  registerPushAsync?(): Promise<string>;
  unregisterPushAsync?(): Promise<void>;
  addListener?(event: 'onPushTokenChanged' | 'onSharedDatabaseChanged', listener: () => void): { remove(): void };
};

let cached: LocalNotificationsModule | null | undefined;

/** Resolve only on first use so older native builds and Expo Go remain usable. */
export function loadLocalNotifications(): LocalNotificationsModule | null {
  if (cached === undefined) {
    try {
      cached = requireOptionalNativeModule<LocalNotificationsModule>('ExpoLocalNotifications');
    } catch {
      cached = null;
    }
  }
  return cached;
}
