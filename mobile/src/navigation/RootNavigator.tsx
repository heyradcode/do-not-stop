import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { placeholderFor } from '../screens/PlaceholderScreen';
import { neon } from '../theme/neon';
import {
    STACK_TITLES,
    TAB_ITEMS,
    type MainTabParamList,
    type RootStackParamList,
} from './routes';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

/** Phase 4 swaps these for the real screens, one per commit. */
const TAB_SCREENS: Record<keyof MainTabParamList, React.ComponentType> = {
    Gallery: placeholderFor('Gallery'),
    Battle: placeholderFor('Battle Arena'),
    Breed: placeholderFor('Breeding Lab'),
    LevelUp: placeholderFor('Level Up'),
    Train: placeholderFor('Training Ground'),
};

const STACK_SCREENS = {
    Marriage: placeholderFor('Marriage'),
    Rename: placeholderFor('Rename Pet'),
    Defense: placeholderFor('Allow Challenges'),
} as const;

/**
 * Built once at module scope rather than inline in the map below. `tabBarIcon` is
 * a render prop, so defining it during render hands the tab bar a new component
 * type every pass and remounts the icon.
 */
const TAB_OPTIONS = Object.fromEntries(
    TAB_ITEMS.map((item) => {
        const Icon = ({ color }: { color: string }) => (
            <Text style={[styles.tabGlyph, { color }]}>{item.glyph}</Text>
        );
        Icon.displayName = `TabIcon(${item.name})`;
        return [item.name, { title: item.label, tabBarIcon: Icon }];
    }),
) as Record<keyof MainTabParamList, { title: string; tabBarIcon: React.FC<{ color: string }> }>;

export const MainTabs = () => (
    <Tab.Navigator
        screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: neon.cyan,
            tabBarInactiveTintColor: neon.textDim,
            tabBarStyle: styles.tabBar,
            tabBarLabelStyle: styles.tabLabel,
        }}
    >
        {TAB_ITEMS.map((item) => (
            <Tab.Screen
                key={item.name}
                name={item.name}
                component={TAB_SCREENS[item.name]}
                options={TAB_OPTIONS[item.name]}
            />
        ))}
    </Tab.Navigator>
);

/**
 * Landing sits outside the tab shell so the connect screen has no tab bar. The
 * gate that decides which one is shown lands in step 3.2; for now `Main` is the
 * initial route so the shell can be exercised.
 */
export const RootNavigator = () => (
    <Stack.Navigator
        initialRouteName="Main"
        screenOptions={{
            headerStyle: styles.header,
            headerTintColor: neon.text,
            contentStyle: styles.content,
        }}
    >
        <Stack.Screen
            name="Landing"
            component={placeholderFor('Do Not Stop')}
            options={{ headerShown: false }}
        />
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        {(Object.keys(STACK_SCREENS) as (keyof typeof STACK_SCREENS)[]).map((name) => (
            <Stack.Screen
                key={name}
                name={name}
                component={STACK_SCREENS[name]}
                options={{ title: STACK_TITLES[name] }}
            />
        ))}
    </Stack.Navigator>
);

const styles = StyleSheet.create({
    tabBar: {
        backgroundColor: neon.bgPanel,
        borderTopColor: neon.border,
    },
    tabLabel: {
        fontSize: 11,
        fontWeight: '700',
    },
    tabGlyph: {
        fontSize: 18,
    },
    header: {
        backgroundColor: neon.bgPanel,
    },
    content: {
        backgroundColor: neon.bgDeep,
    },
});
