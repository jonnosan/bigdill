/**
 * state.js — Shared application state and screen navigation.
 *
 * AppState.currentGame  — full game object from server (or null)
 * AppState.navigate(screen)  — switch between 'gamelist', 'setup', 'gameevents'
 */
const AppState = (() => {
  let currentGame = null;
  const screens = ['gamelist', 'setup', 'gameevents'];

  function navigate(screen, game) {
    if (!screens.includes(screen)) return;

    if (game !== undefined) currentGame = game;

    // Tear down previous screen
    if (typeof GameEvents !== 'undefined' && screen !== 'gameevents') GameEvents.destroy();

    // Switch active screen
    for (const s of screens) {
      const el = document.getElementById(`${s}-screen`);
      if (el) el.classList.toggle('active', s === screen);
    }

    // Initialise new screen
    if (screen === 'gamelist' && typeof GameList !== 'undefined') GameList.init();
    if (screen === 'setup' && typeof Setup !== 'undefined') Setup.init(currentGame);
    if (screen === 'gameevents' && typeof GameEvents !== 'undefined') GameEvents.init(currentGame);
  }

  return {
    get currentGame() { return currentGame; },
    set currentGame(g) { currentGame = g; },
    navigate,
  };
})();
