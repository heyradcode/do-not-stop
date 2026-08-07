/**
 * Public surface of the chat feature. External code imports from `@features/chat` so
 * the internal layout can change without touching call sites.
 */
export { getMessages, getThreads, postMessage, postRead } from './chat.controller';
export { authorizeThread, listThreads, type ChatDenial, type ChatThreadView } from './chat.service';
