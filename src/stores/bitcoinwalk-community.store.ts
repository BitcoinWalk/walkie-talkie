import { create } from 'zustand';

export type BitcoinWalkCommunityScope = 'city' | 'global' | 'hosts';

type State = {
  scope: BitcoinWalkCommunityScope;
  select: (scope: BitcoinWalkCommunityScope) => void;
};

/** Session-only destination for the Chats tab. Every app launch starts locally. */
export const useBitcoinWalkCommunity = create<State>((set) => ({
  scope: 'city',
  select: (scope) => set({ scope }),
}));
