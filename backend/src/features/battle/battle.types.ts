export const SUPPORTED_CHAINS = ['evm', 'solana'] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export interface OpponentDto {
    id: string;
    chain: SupportedChain;
    owner: string;
    name: string;
    dna: string;
    level: number;
    rarity: number;
    winCount: number;
    lossCount: number;
    readyAt: number;
}

export interface OpponentsResponse {
    opponents: OpponentDto[];
    total: number;
    page: number;
    pageSize: number;
}

export interface OpponentsQuery {
    chain: SupportedChain;
    caller: string;
    minLevel: number;
    page: number;
    pageSize: number;
}

export interface BattleErrorResponse {
    error: string;
}
