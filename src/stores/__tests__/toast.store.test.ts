import { showToast, useToastStore } from '../toast.store';

beforeEach(() => {
  useToastStore.setState({ message: null, target: null, id: 0 });
});

it('replaces scoped feedback with window feedback when no target is supplied', () => {
  showToast('Saved', { target: 'detail' });
  expect(useToastStore.getState()).toMatchObject({ message: 'Saved', target: 'detail', id: 1 });
  showToast('Saved');
  expect(useToastStore.getState()).toMatchObject({ message: 'Saved', target: null, id: 2 });
});

it('supports either column and clears its target when hidden', () => {
  showToast('Copied', { target: 'primary' });
  expect(useToastStore.getState().target).toBe('primary');
  useToastStore.getState().hide();
  expect(useToastStore.getState()).toMatchObject({ message: null, target: null });
});
