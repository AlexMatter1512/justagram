import type { ProfileResponse, ProfileState } from '../../types';

(function() {
  'use strict';

  let state: ProfileState = window.__JUSTAGRAM_DATA__?.profileState || { profiles: [], activeId: '' };
  let selectedId = state.activeId;
  let view: 'list' | 'actions' | 'create' | 'rename' | 'remove' = 'list';
  let pending: { id: string; action: string; timer: ReturnType<typeof setTimeout> } | null = null;
  let returnFocus: HTMLElement | null = null;

  // A shadow root keeps Instagram's styles and hiding rules out of the modal.
  const host = document.createElement('div');
  host.id = 'justagram-profiles';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { color-scheme: dark; }
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      dialog { position: fixed; inset: 0; width: min(400px, calc(100% - 32px));
        max-height: calc(100dvh - 48px); margin: auto; padding: 24px;
        overflow: auto; overscroll-behavior: contain; background: #19191f;
        color: #f5f5f7; border: 1px solid #383840; border-radius: 20px;
        box-shadow: 0 24px 80px #0008; font: 15px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      dialog::backdrop { background: #000b; }
      header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
      h2 { font-size: 23px; line-height: 1.25; margin: 0; overflow-wrap: anywhere; }
      p { color: #b8b8c3; margin: 0 0 16px; }
      button, input { font: inherit; border-radius: 12px; min-height: 48px; width: 100%; padding: 12px 14px; }
      button { border: 1px solid #383840; background: #292932; color: #fff; cursor: pointer; font-weight: 600; }
      button + button { margin-top: 10px; }
      button.primary { background: #e1306c; border-color: #e1306c; }
      button.danger { background: #42202c; color: #ffb4ca; border-color: #71374b; }
      button.close { width: 44px; min-width: 44px; min-height: 44px; padding: 0; font-size: 25px; background: transparent; border: 0; }
      button.back { width: auto; padding: 4px 0; background: transparent; border: 0; margin-bottom: 12px; color: #ff96b8; }
      button.profile { display: flex; align-items: center; justify-content: space-between; gap: 12px; text-align: left; }
      .profile span { overflow-wrap: anywhere; min-width: 0; }
      .profile small { color: #ff96b8; font-weight: 400; white-space: nowrap; }
      #add { margin-top: 16px; }
      label { display: block; margin: 0 0 8px; }
      input { background: #0b0b0e; color: #fff; border: 1px solid #555560; margin-bottom: 16px; }
      :focus-visible { outline: 2px solid #ff96b8; outline-offset: 3px; }
      :disabled { opacity: .55; cursor: wait; }
      #error { color: #ffb4ca; margin: 16px 0 0; }
      #status { margin: 16px 0 0; }
      #error:empty, #status:empty { display: none; }
      .hint { font-size: 13px; margin: 12px 0 0; }
    </style>
    <dialog aria-labelledby="title">
      <header><h2 id="title">Profiles</h2><button class="close" id="close" type="button" aria-label="Close profiles">×</button></header>
      <button class="back" id="back" type="button" hidden>‹ Profiles</button>
      <section id="list-view">
        <p>Choose a profile to open or manage.</p>
        <div id="profiles"></div>
        <button class="primary" id="add" type="button">Add a profile</button>
      </section>
      <section id="actions-view" hidden>
        <p id="selected-description"></p>
        <button class="primary" id="open" type="button">Open profile</button>
        <button id="edit" type="button">Edit name</button>
        <button class="danger" id="delete" type="button">Delete profile</button>
        <p class="hint" id="original-hint" hidden>The original profile can be renamed but cannot be deleted.</p>
      </section>
      <form id="name-form" hidden>
        <label for="name">Profile name</label>
        <input id="name" name="name" maxlength="40" required autocomplete="off" placeholder="e.g. Personal or Work">
        <p id="new-hint">Sign in to Instagram the first time you open this profile.</p>
        <button class="primary" id="save" type="submit">Create profile</button>
      </form>
      <section id="remove-view" hidden>
        <p id="remove-description"></p>
        <button class="danger" id="confirm-delete" type="button">Delete profile</button>
        <button id="cancel-delete" type="button">Cancel</button>
      </section>
      <p id="status" role="status"></p>
      <p id="error" role="alert"></p>
    </dialog>`;
  document.body.appendChild(host);
  const get = <T extends HTMLElement = HTMLElement>(id: string) => root.getElementById(id) as T;
  const dialog = root.querySelector('dialog')!;
  const nameInput = get<HTMLInputElement>('name');

  function setBusy(busy: boolean): void {
    root.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input').forEach(el => { el.disabled = busy; });
    dialog.setAttribute('aria-busy', String(busy));
    get('status').textContent = busy ? 'Please wait…' : '';
  }

  function render(focus = true): void {
    const profile = state.profiles.find(p => p.id === selectedId);
    if (!profile && view !== 'create') view = 'list';
    get('list-view').hidden = view !== 'list';
    get('actions-view').hidden = view !== 'actions';
    get('name-form').hidden = view !== 'create' && view !== 'rename';
    get('remove-view').hidden = view !== 'remove';
    get('back').hidden = view === 'list';
    get('title').textContent = view === 'list' ? 'Profiles' : view === 'create' ? 'Add a profile' : view === 'rename' ? 'Edit profile' : view === 'remove' ? 'Delete profile?' : profile?.name || 'Profile';
    if (view === 'list') {
      get('profiles').replaceChildren(...state.profiles.map(p => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'profile';
        button.dataset.profileId = p.id;
        const label = document.createElement('span');
        label.textContent = p.name;
        button.append(label);
        if (p.id === state.activeId) {
          const current = document.createElement('small');
          current.textContent = 'Current';
          button.append(current);
        }
        button.addEventListener('click', () => {
          selectedId = p.id;
          changeView('actions');
        });
        return button;
      }));
    } else if (view === 'actions') {
      get('selected-description').textContent = selectedId === state.activeId ? 'You are using this profile.' : 'This profile keeps its own Instagram login.';
      get('open').textContent = selectedId === state.activeId ? 'Return to Instagram' : 'Open profile';
      get('delete').hidden = selectedId === 'default';
      get('original-hint').hidden = selectedId !== 'default';
    } else if (view === 'create' || view === 'rename') {
      nameInput.value = view === 'rename' ? profile!.name : '';
      get('save').textContent = view === 'rename' ? 'Save name' : 'Create profile';
      get('new-hint').hidden = view !== 'create';
    } else if (view === 'remove') {
      get('remove-description').textContent = `Delete “${profile!.name}” and its saved login from this device? This cannot be undone. Your Instagram account will not be deleted.${selectedId === state.activeId ? ' Your original profile will open next.' : ''}`;
    }
    if (focus && dialog.open) {
      if (view === 'create' || view === 'rename') nameInput.focus();
      else if (view === 'actions') get('open').focus();
      else if (view === 'remove') get('cancel-delete').focus();
      else (get('profiles').querySelector('button') || get('add')).focus();
    }
  }

  function changeView(next: typeof view): void {
    if (pending) return;
    view = next;
    get('error').textContent = '';
    render();
  }

  function request(action: string, payload: { id?: string; name?: string } = {}): void {
    if (pending) return;
    const bridge = window.webkit?.messageHandlers?.cordova_iab;
    if (!bridge) {
      get('error').textContent = 'Profile management is unavailable. Please reopen JustAgram.';
      return;
    }
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending = null;
      setBusy(false);
      get('error').textContent = 'The request timed out. Close and reopen Profiles before trying again.';
    }, 30000);
    pending = { id: requestId, action, timer };
    get('error').textContent = '';
    setBusy(true);
    bridge.postMessage(JSON.stringify({ type: 'profiles', action, requestId, ...payload }));
  }

  function openModal(refresh = true): void {
    if (dialog.open) return;
    returnFocus = document.activeElement as HTMLElement | null;
    view = 'list';
    render(false);
    dialog.showModal();
    render();
    if (refresh) request('list');
  }

  window.addEventListener('justagram-open-profiles', () => openModal());
  window.addEventListener('justagram-profiles-result', event => {
    const response = (event as CustomEvent<ProfileResponse>).detail;
    if (!pending || response.requestId !== pending.id) return;
    const action = pending.action;
    clearTimeout(pending.timer);
    pending = null;
    state = response;
    setBusy(false);
    if (response.error) {
      get('error').textContent = response.error;
      return;
    }
    if (action === 'open') { dialog.close(); return; }
    selectedId = response.selectedId || selectedId;
    if (action === 'create' || action === 'rename') view = 'actions';
    if (action === 'remove') view = 'list';
    render();
  });

  get('close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { if (pending) event.preventDefault(); });
  dialog.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); });
  dialog.addEventListener('click', event => {
    const r = dialog.getBoundingClientRect();
    if (!pending && event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) dialog.close();
  });
  // Keep Instagram's delegated event handlers out of the modal's controls.
  root.addEventListener('click', event => event.stopPropagation());
  root.addEventListener('keydown', event => event.stopPropagation());
  root.addEventListener('keyup', event => event.stopPropagation());
  get('back').addEventListener('click', () => changeView('list'));
  get('add').addEventListener('click', () => changeView('create'));
  get('edit').addEventListener('click', () => changeView('rename'));
  get('delete').addEventListener('click', () => changeView('remove'));
  get('cancel-delete').addEventListener('click', () => changeView('actions'));
  get('open').addEventListener('click', () => request('open', { id: selectedId }));
  get('confirm-delete').addEventListener('click', () => request('remove', { id: selectedId }));
  get('name-form').addEventListener('submit', event => {
    event.preventDefault();
    request(view === 'create' ? 'create' : 'rename', { id: selectedId, name: nameInput.value });
  });

  function isProfileSwitcher(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    const button = target.closest('button, [role="button"]');
    if (!button) return false;
    // The inbox account selector contains a heading and chevron, beside Compose.
    if (/^\/direct(?:\/inbox)?\/?$/.test(location.pathname)) {
      return !!button.querySelector('h2[dir="auto"]') &&
        !!button.querySelector('svg[viewBox="0 0 24 24"][height="12"]') &&
        !!button.parentElement?.querySelector('a[href="/direct/new/"]');
    }
    const header = button.closest('header h1')?.closest('header');
    if (!header?.querySelector('a[href^="/accounts/settings/"]')) return false;
    const username = location.pathname.match(/^\/([\w.]+)\/?$/)?.[1];
    return !!username && Array.from(button.querySelectorAll('span[dir="auto"]')).some(
      span => span.textContent?.trim().toLowerCase() === username.toLowerCase()
    );
  }

  function switchProfile(event: MouseEvent | KeyboardEvent): void {
    if (!isProfileSwitcher(event.target)) return;
    if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'keyup' || (event instanceof KeyboardEvent && event.repeat)) return;
    openModal();
  }
  window.addEventListener('click', switchProfile, true);
  window.addEventListener('keydown', switchProfile, true);
  window.addEventListener('keyup', switchProfile, true);
  if (state.show) {
    openModal(false);
    get('error').textContent = state.error || '';
  }
})();
