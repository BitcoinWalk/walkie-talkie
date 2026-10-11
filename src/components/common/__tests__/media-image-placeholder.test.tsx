import { Image } from 'expo-image';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { View } from 'react-native';
import { MediaImagePlaceholder } from '../MediaImagePlaceholder';

jest.mock('expo-image', () => ({ Image: () => null }));
let renderer: ReactTestRenderer;
afterEach(() => act(() => renderer.unmount()));

it.each([
  [16 / 9, 390, 844, 390, 219.375],
  [9 / 16, 844, 390, 219.375, 390],
  [1, 390, 844, 390, 390],
])('fits aspect %s inside %s × %s and fills the exact rectangle', (aspectRatio, width, height, expectedWidth, expectedHeight) => {
  act(() => { renderer = create(<MediaImagePlaceholder thumbhash="preview" aspectRatio={aspectRatio} />); });
  act(() => { renderer.root.findByType(View).props.onLayout({ nativeEvent: { layout: { width, height } } }); });
  const image = renderer.root.findByType(Image);
  expect(image.props.style).toEqual({ width: expectedWidth, height: expectedHeight });
  expect(image.props.contentFit).toBe('fill');
  expect(image.props.placeholderContentFit).toBe('fill');
  expect(image.props.source).toBeUndefined();
});

it('uses the intrinsic hash ratio when dimensions are missing', () => {
  act(() => { renderer = create(<MediaImagePlaceholder thumbhash="preview" />); });
  act(() => { renderer.root.findByType(View).props.onLayout({ nativeEvent: { layout: { width: 390, height: 844 } } }); });
  expect(renderer.root.findByType(Image).props.contentFit).toBe('contain');
});
