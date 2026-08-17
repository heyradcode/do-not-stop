import React from 'react';
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import SessionGate from '../components/SessionGate';
import PetArt from '../components/PetArt';
import {
    BOARDS,
    useLeaderboardPanel,
    type Standing,
} from '../hooks/leaderboard/useLeaderboardPanel';
import { winPercent } from '../utils/petStats';
import { neon, neonGlow } from '../theme/neon';

/** Metal for each of the top three, and nothing below. */
const MEDALS = ['#ffd45e', '#c9d4e4', '#d08a52'] as const;

/**
 * One line of the board.
 *
 * The medal is decided by the rank itself and not by position in the page, so third
 * place keeps its colour on a searched board and page two grows no medals. Ranks from
 * the backend are absolute for exactly this reason.
 *
 * The win rate is drawn as a bar as well as printed. A column of percentages has to be
 * read one at a time; a column of bars shows the shape of the board at a glance.
 */
const Row: React.FC<{ standing: Standing }> = ({ standing }) => {
    const rate = winPercent(standing);
    const medal = standing.rank <= MEDALS.length ? MEDALS[standing.rank - 1] : null;
    const size = medal ? 52 : 40;

    return (
        <View
            style={[
                styles.row,
                medal ? { borderColor: medal } : null,
                standing.isYou && styles.rowYou,
            ]}
        >
            <Text style={[styles.rank, medal ? { color: medal } : null]}>{standing.rank}</Text>

            <View style={[styles.avatar, { width: size, height: size }]}>
                {standing.pet ? (
                    <PetArt pet={standing.pet} size={size} />
                ) : (
                    <Text style={{ fontSize: size * 0.62 }}>👤</Text>
                )}
            </View>

            <View style={styles.identity}>
                <Text
                    style={[styles.name, standing.accent ? { color: standing.accent } : null]}
                    numberOfLines={1}
                >
                    {standing.title}
                </Text>
                <Text style={styles.sub}>
                    {standing.sub}
                    {standing.isYou ? '  ·  you' : ''}
                </Text>
                <View style={styles.meter}>
                    <View style={[styles.meterFill, { width: `${rate ?? 0}%` }]} />
                </View>
            </View>

            <View style={styles.record}>
                <Text style={styles.wins}>{standing.winCount}W</Text>
                <Text style={styles.losses}>{standing.lossCount}L</Text>
                <Text style={styles.rate}>{rate == null ? '—' : `${rate}%`}</Text>
            </View>
        </View>
    );
};

/**
 * Pets ranked by battle record, and their owners ranked by the same record summed.
 *
 * Read-only, so it composes the shared hooks directly and keeps its form state local
 * rather than going through a controller hook. There is no multi-step flow here to
 * model, which is the test that decides between the two shapes on both clients.
 *
 * The ranking is entirely the backend's. It ranks over the merged record
 * (`pet_battle_progress` above the frozen `pet_roster` counters) inside the query that
 * orders the rows, so this renders the page it is given and never re-sorts: a local
 * sort could only reorder rows the server already picked, and would then disagree with
 * the `rank` printed beside them.
 */
export default function LeaderboardScreen() {
    const panel = useLeaderboardPanel();

    const header = (
        <View>
            <Text style={styles.title}>Leaderboard</Text>
            <Text style={styles.subtitle}>Ranked by wins, then by fewest losses</Text>

            <View style={styles.tabs}>
                {BOARDS.map((option) => (
                    <TouchableOpacity
                        key={option.id}
                        style={[styles.tab, panel.board === option.id && styles.tabActive]}
                        onPress={() => panel.onBoardChange(option.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Show ${option.label} board`}
                        accessibilityState={{ selected: panel.board === option.id }}
                        activeOpacity={0.85}
                    >
                        <Text
                            style={[styles.tabText, panel.board === option.id && styles.tabTextActive]}
                        >
                            {option.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <TextInput
                style={styles.search}
                value={panel.term}
                onChangeText={panel.onTermChange}
                placeholder="Search by pet name or wallet address"
                placeholderTextColor={neon.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Search by pet name or wallet address"
            />

            {/*
             * Frontend keeps this in its sidebar, which mobile has no equivalent of.
             * A null rank is unranked, a real state rather than an error: it is what a
             * player who has never fought should be told.
             */}
            <View style={styles.yourRank}>
                <Text style={styles.yourRankLabel}>Your standing</Text>
                <Text style={styles.yourRankValue}>
                    {panel.yourRank
                        ? `#${panel.yourRank.rank}  ·  ${panel.yourRank.winCount}W ${panel.yourRank.lossCount}L`
                        : 'Unranked. Win a battle to join the board.'}
                </Text>
            </View>
        </View>
    );

    const body = panel.error ? (
        <Text style={styles.error}>{panel.error.message}</Text>
    ) : panel.isLoading ? (
        <View style={styles.loading}>
            <ActivityIndicator size="large" color={neon.cyan} />
        </View>
    ) : panel.total === 0 ? (
        <Text style={styles.empty}>
            {panel.search
                ? `Nothing on the board matches "${panel.search}".`
                : 'No battles on record yet. Win one and the board fills up.'}
        </Text>
    ) : null;

    return (
        <SessionGate
            title="Leaderboard"
            connectPrompt="Connect your wallet to see the rankings."
            signInPrompt="Sign in to see the rankings. The board is ranked server-side, so it needs to know who is asking."
        >
            <FlatList
                style={styles.root}
            contentContainerStyle={styles.content}
            data={body ? [] : panel.standings}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => <Row standing={item} />}
            ListHeaderComponent={header}
            ListEmptyComponent={body}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={
                body || panel.total === 0 ? null : (
                    <View style={styles.pager}>
                        <TouchableOpacity
                            style={[styles.pageBtn, panel.page === 0 && styles.pageBtnOff]}
                            onPress={() => panel.onPage(panel.page - 1)}
                            disabled={panel.page === 0}
                            accessibilityLabel="Previous page"
                        >
                            <Text style={styles.pageBtnText}>←</Text>
                        </TouchableOpacity>

                        <Text style={styles.pageLabel}>
                            {panel.firstOnPage}–{panel.lastOnPage} of {panel.total}
                        </Text>

                        <TouchableOpacity
                            style={[styles.pageBtn, panel.page >= panel.lastPage && styles.pageBtnOff]}
                            onPress={() => panel.onPage(panel.page + 1)}
                            disabled={panel.page >= panel.lastPage}
                            accessibilityLabel="Next page"
                        >
                            <Text style={styles.pageBtnText}>→</Text>
                        </TouchableOpacity>
                    </View>
                )
            }
            />
        </SessionGate>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: neon.bgDeep,
    },
    content: {
        padding: 16,
        paddingBottom: 32,
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: neon.text,
        letterSpacing: 0.5,
        textShadowColor: neon.cyan,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    subtitle: {
        fontSize: 14,
        color: neon.textMuted,
        marginTop: 6,
        marginBottom: 16,
    },
    tabs: {
        flexDirection: 'row',
        backgroundColor: neon.bgPanel,
        borderRadius: 12,
        padding: 4,
        borderWidth: 1,
        borderColor: neon.border,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 9,
    },
    tabActive: {
        backgroundColor: neon.bgCard,
        ...neonGlow(neon.cyan, 8, 0.3),
    },
    tabText: {
        fontSize: 14,
        fontWeight: '700',
        color: neon.textDim,
    },
    tabTextActive: {
        color: neon.cyan,
    },
    search: {
        marginTop: 12,
        backgroundColor: neon.bgInput,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: neon.border,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 14,
        color: neon.text,
    },
    yourRank: {
        marginTop: 12,
        marginBottom: 16,
        backgroundColor: neon.bgPanel,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: neon.borderMagenta,
        padding: 12,
    },
    yourRankLabel: {
        fontSize: 11,
        fontWeight: '800',
        color: neon.textDim,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    yourRankValue: {
        marginTop: 4,
        fontSize: 14,
        fontWeight: '700',
        color: neon.magenta,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: neon.border,
        padding: 10,
        marginBottom: 8,
    },
    rowYou: {
        backgroundColor: neon.bgPanel,
        borderColor: neon.magenta,
    },
    rank: {
        width: 34,
        fontSize: 18,
        fontWeight: '800',
        color: neon.textMuted,
        textAlign: 'center',
    },
    avatar: {
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    identity: {
        flex: 1,
        minWidth: 0,
    },
    name: {
        fontSize: 15,
        fontWeight: '800',
        color: neon.text,
    },
    sub: {
        fontSize: 12,
        color: neon.textMuted,
        marginTop: 2,
    },
    meter: {
        marginTop: 6,
        height: 4,
        borderRadius: 2,
        backgroundColor: neon.bgInput,
        overflow: 'hidden',
    },
    meterFill: {
        height: 4,
        borderRadius: 2,
        backgroundColor: neon.cyan,
    },
    record: {
        alignItems: 'flex-end',
        marginLeft: 8,
    },
    wins: {
        fontSize: 13,
        fontWeight: '800',
        color: neon.success,
    },
    losses: {
        fontSize: 13,
        fontWeight: '700',
        color: neon.danger,
    },
    rate: {
        fontSize: 11,
        color: neon.textDim,
        marginTop: 2,
    },
    loading: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    empty: {
        marginTop: 8,
        fontSize: 14,
        lineHeight: 20,
        color: neon.textMuted,
    },
    error: {
        marginTop: 8,
        fontSize: 13,
        color: neon.danger,
    },
    pager: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 8,
    },
    pageBtn: {
        width: 44,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: neon.bgCard,
        borderWidth: 1,
        borderColor: neon.cyan,
    },
    pageBtnOff: {
        opacity: 0.35,
    },
    pageBtnText: {
        color: neon.cyan,
        fontSize: 18,
        fontWeight: '800',
    },
    pageLabel: {
        fontSize: 13,
        color: neon.textMuted,
        fontWeight: '700',
    },
});
