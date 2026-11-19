window.JustagramDOMHandlers = window.JustagramDOMHandlers || {};

function handleNavigation() {
  window.dispatchEvent(new Event('justagram-navigation'));
  window.JustagramDOMHandlers[window.location.pathname]?.();
}

const originalPushState = history.pushState;
history.pushState = function (...args) {
  originalPushState.apply(this, args);
  handleNavigation();
};

const originalReplaceState = history.replaceState;
history.replaceState = function (...args) {
  originalReplaceState.apply(this, args);
  handleNavigation();
};

window.addEventListener('popstate', handleNavigation);

// All independently bundled route handlers must be registered for the first visit.
setTimeout(handleNavigation, 0);
