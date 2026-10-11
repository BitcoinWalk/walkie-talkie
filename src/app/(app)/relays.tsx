import { useLocalSearchParams } from 'expo-router';

import { RelaySettingsScreen } from '@/components/settings/RelaySettingsScreen';

export default function RelaysPage() {
  const { addDmRelay } = useLocalSearchParams<{ addDmRelay?: string | string[] }>();
  const initialDmRelay = typeof addDmRelay === 'string' ? addDmRelay : undefined;
  return <RelaySettingsScreen initialDmRelay={initialDmRelay} />;
}
