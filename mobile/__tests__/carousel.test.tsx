/**
 * The paged list behind the Gallery, and behind the marriage list after it.
 *
 * Exercised directly rather than through a screen: the interesting behaviour is arithmetic
 * over a measured width and a scroll offset, and driving it through `GalleryScreen` would put
 * a pet fixture between the test and the thing being tested.
 */

import React from 'react';
import { FlatList, Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import Carousel from '../src/components/ui/Carousel';

const items = (count: number) => Array.from({ length: count }, (_, i) => ({ id: String(i) }));

const carousel = (count: number) => (
    <Carousel
        data={items(count)}
        keyExtractor={(item) => item.id}
        itemLabel="Pet"
        renderItem={(item) => <Text>{`page:${item.id}`}</Text>}
    />
);

/**
 * Every tree is unmounted after its test.
 *
 * `VirtualizedList` keeps deciding which cells to render after the render that mounted it,
 * on its own timers. A tree left standing does that once the test has moved on, and React
 * reports it as an update outside `act(...)` blamed on whichever test is running then.
 */
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

const renderCarousel = async (count: number) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(carousel(count));
    });
    mounted.push(tree);
    return tree;
};

afterEach(async () => {
    await ReactTestRenderer.act(async () => {
        mounted.splice(0).forEach((tree) => tree.unmount());
    });
});

const indicator = (tree: ReactTestRenderer.ReactTestRenderer): string =>
    tree.root
        .findAllByType(Text)
        .filter((node) => node.props.testID === 'carousel-indicator')
        .map((node) => (node.props.children as unknown[]).join(''))
        .join('');

/** Stands in for the layout pass, which never runs under `react-test-renderer`. */
const measure = async (tree: ReactTestRenderer.ReactTestRenderer, width: number) => {
    const root = tree.root.findAllByType(View).find((node) => node.props.testID === 'carousel');
    await ReactTestRenderer.act(async () => {
        root!.props.onLayout({ nativeEvent: { layout: { width } } });
    });
};

const scrollTo = async (tree: ReactTestRenderer.ReactTestRenderer, x: number) => {
    const list = tree.root.findByType(FlatList);
    await ReactTestRenderer.act(async () => {
        list.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x } } });
    });
};

describe('Carousel', () => {
    it('counts the whole set, not the pages it has mounted', async () => {
        // The distinction is the point of windowing: twelve pets exist, roughly one is
        // mounted, and a counter reading "1 / 1" would be worse than no counter at all.
        const tree = await renderCarousel(12);
        expect(indicator(tree)).toBe('1 / 12');
    });

    it('reports the page you land on', async () => {
        const tree = await renderCarousel(12);
        await measure(tree, 360);
        await scrollTo(tree, 720);
        expect(indicator(tree)).toBe('3 / 12');
    });

    it('ignores a scroll that arrives before it has been measured', async () => {
        // Width is 0 until the layout pass, and dividing the offset by it gives Infinity,
        // which the clamp then turns into the last page. So a scroll landing in that window
        // would report the roster's end no matter where the player actually was.
        const tree = await renderCarousel(12);
        await scrollTo(tree, 720);
        expect(indicator(tree)).toBe('1 / 12');
    });

    it('clamps to the last page when the set shrinks under it', async () => {
        const tree = await renderCarousel(5);
        await measure(tree, 360);
        await scrollTo(tree, 360 * 4);
        expect(indicator(tree)).toBe('5 / 5');

        // A pet sent away while you were looking at the end of the roster.
        await ReactTestRenderer.act(async () => {
            tree.update(carousel(2));
        });
        expect(indicator(tree)).toBe('2 / 2');
    });

    it('mounts a page at a time rather than the whole set', async () => {
        // The other half of why this is a FlatList: every pet card fetches its own art, so
        // the vertical list it replaced put twenty image requests on screen at once.
        //
        // The bound is loose because it is a claim about roughly how many, not exactly: RN
        // mounts one here today, and a version that also mounted a neighbour would still be
        // doing the right thing. `initialNumToRender`'s default of 10 would not be, and is
        // what this catches.
        const tree = await renderCarousel(12);
        const pages = tree.root
            .findAllByType(Text)
            .filter((node) => String(node.props.children).startsWith('page:'));
        expect(pages.length).toBeGreaterThan(0);
        expect(pages.length).toBeLessThanOrEqual(3);
    });
});
