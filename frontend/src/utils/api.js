/**
 * Centered API and WebSocket configuration for the CovA platform.
 * 
 * In production (Vercel), we must use absolute URLs to talk to the Render backend.
 * In development, we use relative paths which Vite proxies to localhost:3001.
 */

// Prefer VITE_API_BASE_URL if set, otherwise fallback for local dev
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Derived WS URL handles correctly based on the current scheme (http -> ws, https -> wss)
export const getWsUrl = () => {
    // 1. Check for explicit WebSocket override
    if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
    
    // 2. If we have a base API URL, derive WS from it
    if (import.meta.env.VITE_API_BASE_URL) {
        return import.meta.env.VITE_API_BASE_URL.replace(/^http/, 'ws') + '/ws';
    }
    
    // 3. Fallback to local host (standard local dev)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
};
