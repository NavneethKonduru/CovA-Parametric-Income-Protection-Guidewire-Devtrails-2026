let apiBaseUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';
if (apiBaseUrl.endsWith('/')) {
  apiBaseUrl = apiBaseUrl.slice(0, -1);
}
export const API_BASE = apiBaseUrl;

export const getWsUrl = () => {
    let wsUrl = import.meta.env.VITE_WS_URL || '';
    if (wsUrl) {
      if (wsUrl.endsWith('/')) wsUrl = wsUrl.slice(0, -1);
      return wsUrl.endsWith('/ws') ? wsUrl : `${wsUrl}/ws`;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
};
