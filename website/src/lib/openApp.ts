export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5173';

export const openApp = (): void => {
  window.location.href = APP_URL;
};
