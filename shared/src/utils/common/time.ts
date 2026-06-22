/** Format a Unix expiry timestamp (seconds) as a short relative-time label. */
export const formatExpiry = (expirySec: number): string => {
    const diff = expirySec - Math.floor(Date.now() / 1000);
    if (diff <= 0) return 'Expired';
    if (diff < 3600) return `${Math.ceil(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
    return `${Math.floor(diff / 86400)}d`;
};
