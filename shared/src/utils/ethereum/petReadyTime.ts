/** `readyTime` is Unix seconds (bigint from the pets contract). */

export const isPetReady = (readyTime: bigint): boolean => {
    return Date.now() / 1000 >= Number(readyTime);
};

export const getTimeUntilReady = (readyTime: bigint): string => {
    const now = Date.now() / 1000;
    const ready = Number(readyTime);
    const diff = ready - now;

    if (diff <= 0) return 'Ready!';

    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = Math.floor(diff % 60);

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
};
