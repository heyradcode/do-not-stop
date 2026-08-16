import React, { useCallback, useState } from 'react';
import {
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    View,
    type LayoutChangeEvent,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from 'react-native';

import { neon } from '../../theme/neon';

type Props<T> = {
    data: T[];
    keyExtractor: (item: T) => string;
    renderItem: (item: T) => React.ReactElement;
    /** Singular noun for the thing being paged, read out as "Pet 3 of 12". */
    itemLabel: string;
};

/**
 * A horizontal paged list: one item per screen, swiped through, with a counter underneath.
 *
 * The counter is a counter and not dots on purpose. Dots stop being readable somewhere around
 * eight, and a wallet here already holds twenty pets, so the row would either wrap or shrink
 * into a smear that says nothing about where you are.
 */
export default function Carousel<T>({ data, keyExtractor, renderItem, itemLabel }: Props<T>) {
    const [width, setWidth] = useState(0);
    const [index, setIndex] = useState(0);

    /**
     * The page comes from the settled scroll offset rather than from `onViewableItemsChanged`.
     * That callback and its `viewabilityConfig` must both keep the same identity for the life
     * of the list — RN throws `Changing onViewableItemsChanged on the fly is not supported`
     * otherwise — and with `pagingEnabled` the offset already says exactly which page you
     * landed on.
     */
    const onSettled = useCallback(
        (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            if (width <= 0) {
                return;
            }
            setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
        },
        [width],
    );

    /**
     * Measured rather than taken from `useWindowDimensions`, because the pager does not know
     * what padding its parent puts around it. This also means a rotation re-measures for free.
     */
    const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

    // Clamped, so a roster that shrinks under a page you had already swiped to does not leave
    // the counter reading past the end.
    const page = Math.min(index, data.length - 1);

    return (
        <View testID="carousel" style={styles.root} onLayout={onLayout}>
            <FlatList
                data={data}
                keyExtractor={keyExtractor}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onSettled}
                getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
                // Half of why this is a FlatList at all: the vertical list it replaced mounted
                // every card at once, and each card fetches its own art. Now only the page you
                // are on and its immediate neighbours exist.
                initialNumToRender={1}
                windowSize={3}
                renderItem={({ item }) => (
                    /*
                     * Each page scrolls vertically, because a page cannot grow. A card taller
                     * than a short phone would otherwise be cut off at the bottom, and the
                     * bottom is where its actions are. A page that fits never scrolls.
                     */
                    <ScrollView style={{ width }} contentContainerStyle={styles.page}>
                        {renderItem(item)}
                    </ScrollView>
                )}
            />
            <Text
                testID="carousel-indicator"
                style={styles.indicator}
                accessibilityLabel={`${itemLabel} ${page + 1} of ${data.length}`}
            >
                {page + 1} / {data.length}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    page: {
        paddingBottom: 4,
    },
    indicator: {
        marginTop: 8,
        textAlign: 'center',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
        color: neon.textDim,
    },
});
