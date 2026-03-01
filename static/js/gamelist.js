/**
 * gamelist.js — Game List screen.
 */
const GameList = (() => {

  function init() {
    render();
    bindEvents();
  }

  function bindEvents() {
    document.getElementById('btn-new-game').onclick = () => {
      AppState.navigate('setup', null);
    };

    document.getElementById('import-file-input').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = '';
      try {
        const game = await API.importGame(file);
        AppState.navigate('setup', game);
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    };
  }

  async function render() {
    const tbody = document.getElementById('games-tbody');
    const emptyRow = document.getElementById('games-empty-row');
    tbody.innerHTML = '';

    let games;
    try {
      games = await API.getGames();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" style="color:var(--red)">Failed to load games: ${err.message}</td></tr>`;
      return;
    }

    if (!games.length) {
      tbody.appendChild(emptyRow);
      emptyRow.hidden = false;
      return;
    }

    for (const g of games) {
      const tr = document.createElement('tr');
      const teamStr = [g.team_a, g.team_b].filter(Boolean).join(' vs ') || '—';
      tr.innerHTML = `
        <td>${esc(g.game_name || '(unnamed)')}</td>
        <td>${esc(g.date || '—')}</td>
        <td>${esc(teamStr)}</td>
        <td>${g.event_count}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-sm btn-primary" data-action="open" data-id="${g.id}">Open</button>
            <button class="btn btn-sm btn-secondary" data-action="export" data-id="${g.id}" data-name="${esc(g.game_name)}">Export</button>
            <button class="btn btn-sm btn-secondary" data-action="delete" data-id="${g.id}">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.addEventListener('click', handleRowAction);
  }

  async function handleRowAction(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id, name } = btn.dataset;

    if (action === 'open') {
      try {
        const game = await API.getGame(id);
        AppState.navigate('gameevents', game);
      } catch (err) { alert('Error: ' + err.message); }
    }

    if (action === 'export') {
      API.exportGame(id, (name || 'game') + '.bgdl');
    }

    if (action === 'delete') {
      if (!confirm('Delete this game? This cannot be undone.')) return;
      try {
        await API.deleteGame(id);
        render();
      } catch (err) { alert('Error: ' + err.message); }
    }
  }

  function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { init };
})();

// Auto-init on load
document.addEventListener('DOMContentLoaded', () => GameList.init());
