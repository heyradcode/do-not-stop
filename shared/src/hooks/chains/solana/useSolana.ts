import { useSolanaAnchor } from '../../../contexts/SolanaAnchorContext';
import { usePetActions } from './usePetActions';
import { useGlobalState } from './useGlobalState';
import { usePets } from './usePets';
import { usePlayerProfile } from './usePlayerProfile';
import { useProgram } from './useProgram';

/** Composes Solana program hooks for screens that need the full surface area. */
export function useSolana() {
    const { signingWallet } = useSolanaAnchor();
    const program = useProgram();
    const globalState = useGlobalState();
    const playerProfile = usePlayerProfile();
    const pets = usePets(signingWallet?.publicKey ?? null);
    const actions = usePetActions();

    return {
        ...program,
        globalState,
        playerProfile,
        pets,
        ...actions,
    };
}
