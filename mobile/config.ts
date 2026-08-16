import { setEvidenceStore, setTokenSuccessCallback, setStorageAdapter } from '@shared/core';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_URL as ENV_API_URL } from '@env';
import { battleEvidenceStore, hydrateBattleEvidence } from './src/utils/battleEvidenceStore';

export const API_URL = ENV_API_URL;

// Configure token storage callback
setTokenSuccessCallback(async (data) => {
    if (data.success) {
        await AsyncStorage.setItem('authToken', data.token);
    }
});

// Configure storage adapter
setStorageAdapter({
    getToken: () => AsyncStorage.getItem('authToken'),
    setToken: (token: string) => AsyncStorage.setItem('authToken', token),
    removeToken: () => AsyncStorage.removeItem('authToken'),
});

// Battle evidence (§E, §J). Without this, `shared` finds no Web Storage on React
// Native and falls back to a no-op, so the player's signed commitment is dropped
// the moment it arrives. Hydration is deliberately not awaited: it only decides
// whether an earlier launch's evidence is visible, and nothing reads it at import.
setEvidenceStore(battleEvidenceStore);
hydrateBattleEvidence().catch(() => undefined);

