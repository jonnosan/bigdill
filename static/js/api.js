/**
 * api.js — REST API client for BigDill Flask backend.
 */
const API = (() => {
  async function request(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    if (res.status === 204) return null;
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }

  return {
    getGames: () => request('GET', '/api/games'),
    createGame: (data) => request('POST', '/api/games', data),
    getGame: (id) => request('GET', `/api/games/${id}`),
    updateGame: (id, data) => request('PUT', `/api/games/${id}`, data),
    deleteGame: (id) => request('DELETE', `/api/games/${id}`),

    exportGame(id, filename) {
      const a = document.createElement('a');
      a.href = `/api/games/${id}/export`;
      a.download = filename || 'game.bgdl';
      a.click();
    },

    async importGame(file) {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/games/import', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return json;
    },
  };
})();
