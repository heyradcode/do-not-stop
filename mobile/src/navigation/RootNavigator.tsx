import React from 'react';
import { StyleSheet, Text } from 'react-native';
import {
    createBottomTabNavigator,
    type BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAccount } from 'wagmi';

import AppHeader from '../components/AppHeader';
import BattleScreen from '../screens/BattleScreen';
import BreedScreen from '../screens/BreedScreen';
import DefenseScreen from '../screens/DefenseScreen';
import EquipScreen from '../screens/EquipScreen';
import GalleryScreen from '../screens/GalleryScreen';
import LandingScreen from '../screens/LandingScreen';
import InventoryScreen from '../screens/InventoryScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import LevelUpScreen from '../screens/LevelUpScreen';
import MarriageScreen from '../screens/MarriageScreen';
import RenameScreen from '../screens/RenameScreen';
import TrainScreen from '../screens/TrainScreen';
import { neon } from '../theme/neon';
import {
    STACK_TITLES,
    TAB_ITEMS,
    type MainTabParamList,
    type RootStackParamList,
} from './routes';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

/** Every screen is real now; the placeholder module is gone. */
const TAB_SCREENS: Record<keyof MainTabParamList, React.ComponentType> = {
    Gallery: GalleryScreen,
    Battle: BattleScreen,
    Breed: BreedScreen,
    LevelUp: LevelUpScreen,
    Train: TrainScreen,
};

const STACK_SCREENS = {
    Marriage: MarriageScreen,
    Rename: RenameScreen,
    Defense: DefenseScreen,
    Leaderboard: LeaderboardScreen,
    Inventory: InventoryScreen,
    Equip: EquipScreen,
} as const;

/**
 * Built once at module scope rather than inline in the map below. `tabBarIcon` is
 * a render prop, so defining it during render hands the tab bar a new component
 * type every pass and remounts the icon.
 */
const TAB_OPTIONS = TAB_ITEMS.reduce(
    (acc, item) => {
        const Icon = ({ color }: { color: string }) => (
            <Text style={[styles.tabGlyph, { color }]}>{item.glyph}</Text>
        );
        Icon.displayName = `TabIcon(${item.name})`;
        acc[item.name] = { title: item.label, tabBarIcon: Icon };
        return acc;
    },
    {} as Record<keyof MainTabParamList, BottomTabNavigationOptions>,
);

export const MainTabs = () => (
    <>
        <AppHeader />
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
    </>
);

/**
 * Landing sits outside the tab shell so the connect screen has no tab bar and no
 * header.
 *
 * The two halves are registered conditionally rather than both being present with
 * a redirect. That is React Navigation's documented auth-flow shape and it is what
 * makes the transition one-way: with Landing unregistered there is no back target
 * to return to once a wallet connects, and no window where a tab screen renders
 * against a disconnected wallet.
 *
 * The gate is `isConnected`, not `isAuthenticated`. A backend session alone does
 * not let any of these screens work, because every one of them reads chain state.
 */
export const RootNavigator = () => {
    const { isConnected } = useAccount();

    return (
        <Stack.Navigator
            screenOptions={{
                headerStyle: styles.header,
                headerTintColor: neon.text,
                contentStyle: styles.content,
            }}
        >
            {!isConnected ? (
                <Stack.Screen
                    name="Landing"
                    component={LandingScreen}
                    options={{ headerShown: false }}
                />
            ) : (
                <>
                    <Stack.Screen
                        name="Main"
                        component={MainTabs}
                        options={{ headerShown: false }}
                    />
                    {(Object.keys(STACK_SCREENS) as (keyof typeof STACK_SCREENS)[]).map((name) => (
                        <Stack.Screen
                            key={name}
                            name={name}
                            component={STACK_SCREENS[name]}
                            options={{ title: STACK_TITLES[name] }}
                        />
                    ))}
                </>
            )}
        </Stack.Navigator>
    );
};

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
