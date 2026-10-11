import * as Application from 'expo-application';
import { Platform } from 'react-native';

import identities from '../../../config/app-identities.json';

import type { PushNotificationsPort } from '../ports/push-notifications';
import { loadLocalNotifications } from './local-notifications';

export const pushNotificationsAdapter: PushNotificationsPort = {
  isAvailable: () => Platform.OS === 'ios' &&
    typeof loadLocalNotifications()?.registerPushAsync === 'function' &&
    loadLocalNotifications()?.notificationProcessorVersion === 1,
  async getDevice() {
    if (!this.isAvailable()) return null;
    // Read the signed provisioning environment, never the JS build variant.
    let environment = await Application.getIosPushNotificationServiceEnvironmentAsync();
    // Apple strips the embedded profile from store-distributed apps. A store
    // installation with a successful APNs registration uses production APNs.
    if (environment === null && await Application.getIosApplicationReleaseTypeAsync() === Application.ApplicationReleaseType.APP_STORE) {
      environment = 'production';
    }
    if (environment !== 'development' && environment !== 'production') {
      throw new Error('The signed app has no APNs environment');
    }
    const topic = environment === 'development' ? identities.development.id : identities.production.id;
    if (Application.applicationId !== topic) {
      throw new Error('The signed APNs environment does not match a configured relay topic');
    }
    const token = await loadLocalNotifications()!.registerPushAsync!();
    if (!/^(?:[0-9a-fA-F]{2}){1,128}$/.test(token)) throw new Error('Invalid native APNs token');
    return { token: token.toLowerCase(), environment: environment === 'development' ? 'sandbox' : 'production' };
  },
  async unregister() {
    if (Platform.OS === 'ios') await loadLocalNotifications()?.unregisterPushAsync?.();
  },
  async setActiveConversation(context) {
    if (Platform.OS === 'ios') await loadLocalNotifications()?.setActiveConversationAsync?.(
      context?.accountPubkey ?? null, context?.conversationKey ?? null,
    );
  },
  addTokenChangedListener(listener) {
    if (!this.isAvailable()) return () => {};
    const subscription = loadLocalNotifications()?.addListener?.('onPushTokenChanged', listener);
    return () => subscription?.remove();
  },
};
