/**
 * Public surface of the battle-room feature. External code imports from
 * `@features/battle-room` so the internal layout can change without touching
 * call sites.
 */
export { createBattleRoom } from './battle-room.controller';
export type { CreateRoomInput } from './battle-room.service';
