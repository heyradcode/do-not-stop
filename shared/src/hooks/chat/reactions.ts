/**
 * The emoji a chat message may be reacted with.
 *
 * A fixed set, not free text. The client offers exactly these and the server accepts
 * exactly these, so the two cannot drift into a picker that offers something the API
 * refuses. It also keeps the column short and predictable, and — since this is the one
 * place in the product where users author content other users see (see the chat feature's
 * moderation note) — it is a surface with nothing to moderate: there is no arbitrary
 * string to smuggle through.
 *
 * **Only ever append.** A reaction already stored can be removed by its owner only by
 * tapping it again, and that tap is validated against this list: dropping an entry would
 * strand every reaction anyone had already left with it.
 *
 * The first six are WhatsApp's quick bar and lead the grid because they cover most of
 * what anyone reaches for. The rest run from general reactions to the ones this game
 * gives people a reason to use.
 */
export const CHAT_REACTIONS = [
    '👍', '❤️', '😂', '😮', '😢', '🙏',
    '👎', '🔥', '🎉', '👏', '💯', '✅',
    '😍', '🥰', '😊', '😉', '😎', '🤩',
    '🤔', '😅', '😬', '🙄', '😴', '🤯',
    '😭', '😡', '🤝', '💪', '✨', '🌟',
    '🐾', '🥇', '⚔️', '🛡️', '🧬', '💎',
    '🍀', '🎯', '⏰', '🚀',
] as const;

export type ChatReaction = (typeof CHAT_REACTIONS)[number];

/** Whether a client-supplied string is one of the allowed reactions. */
export function isChatReaction(value: string): value is ChatReaction {
    return (CHAT_REACTIONS as readonly string[]).includes(value);
}
