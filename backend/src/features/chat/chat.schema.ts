import { z } from 'zod';
import { CHAT_REACTIONS } from '@shared/core/node';

/**
 * Longest message accepted.
 *
 * A cap is the one content rule v1 has, and it exists for storage and render sanity
 * rather than moderation — see the feature's README note. 2000 characters is far above
 * anything a chat message needs and far below anything worth storing as a document.
 */
export const MAX_MESSAGE_LENGTH = 2000;

/** Default and maximum messages returned per page. */
export const DEFAULT_MESSAGE_PAGE = 50;
export const MAX_MESSAGE_PAGE = 100;

/**
 * Body of POST /api/chat/threads/:id/messages.
 *
 * Trimmed before the length check, so a message of nothing but whitespace is rejected
 * rather than stored as a blank line.
 */
export const SendMessageSchema = z.object({
    text: z.string().transform((value) => value.trim()).pipe(z.string().min(1).max(MAX_MESSAGE_LENGTH)),
});

/** Body of POST /api/chat/threads/:id/read. */
export const MarkReadSchema = z.object({
    /** Newest message the caller has seen. */
    messageId: z.coerce.number().int().positive(),
});

/**
 * Body of POST /api/chat/threads/:id/messages/:messageId/reaction.
 *
 * The emoji must be one the client is allowed to offer. Sharing the list with the
 * frontend is what stops a picker from showing something the API refuses, and it means
 * this endpoint accepts no arbitrary user-authored string at all.
 */
export const ReactSchema = z.object({
    emoji: z.enum(CHAT_REACTIONS),
});

/** Query of GET /api/chat/threads/:id/messages. */
export const ListMessagesSchema = z.object({
    /** Exclusive message id to page backwards from; omit for the newest page. */
    before: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(MAX_MESSAGE_PAGE).default(DEFAULT_MESSAGE_PAGE),
});
