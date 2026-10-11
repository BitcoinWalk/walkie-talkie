export type PushDevice = {
  token: string;
  environment: 'sandbox' | 'production';
};

/** Native APNs registration; never invoked until notification consent is stored. */
export interface PushNotificationsPort {
  isAvailable(): boolean;
  getDevice(): Promise<PushDevice | null>;
  unregister(): Promise<void>;
  setActiveConversation?(context: { accountPubkey: string; conversationKey: string } | null): Promise<void>;
  addTokenChangedListener(listener: () => void): () => void;
}
