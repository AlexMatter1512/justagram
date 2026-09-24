// Requires the debug APK installed on a running Android emulator/device.
// Creates and deletes a disposable profile, restarts the app, and restores the
// original active profile. Existing Instagram logins are preserved.
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  join(homedir(), "Library/Android/sdk");
const adb = process.env.ADB_PATH || join(sdk, "platform-tools/adb");
const serial = process.env.ANDROID_SERIAL || "emulator-5554";
async function command(...args: string[]) {
  const p = Bun.spawn([adb, "-s", serial, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(p.stdout).text();
  assert.equal(await p.exited, 0, await new Response(p.stderr).text());
  return output.trim();
}
async function targets() {
  return (await (await fetch("http://localhost:9223/json")).json()) as any[];
}
async function evaluate(target: any, expression: string) {
  return await cdp(target, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }).then((r: any) => {
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.exception?.description || "Evaluation failed",
      );
    return r.result.value;
  });
}
async function cdp(target: any, method: string, params = {}) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  return await new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Timeout: ${method}`));
    }, 10000);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method, params }));
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("WebSocket error"));
    };
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    };
  });
}
async function until<T>(
  fn: () => Promise<T>,
  message: string,
): Promise<NonNullable<T>> {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result as NonNullable<T>;
    await Bun.sleep(500);
  }
  throw new Error(`Timed out: ${message}`);
}

async function shell() {
  return (await targets()).find(t => t.type === 'page' && t.url === 'https://localhost/');
}
async function readyPage(activeId?: string) {
  return await until(async () => {
    const app = await shell();
    if (app) {
      const error = await evaluate(app, "document.getElementById('startup-error')?.textContent");
      if (error) throw new Error(error);
    }
    const page = (await targets()).find(t => t.type === 'page' && new URL(t.url).hostname === 'www.instagram.com');
    if (!page) return null;
    try {
      const state = await evaluate(page, `document.getElementById('justagram-profiles') && window.__JUSTAGRAM_DATA__?.profileState`);
      if (state && (!activeId || state.activeId === activeId)) return page;
    } catch { /* A new document is still loading. */ }
    return null;
  }, 'Instagram and injected profile modal');
}
async function ui(page: any, code: string) {
  return evaluate(page, `(() => { const root = document.getElementById('justagram-profiles').shadowRoot; ${code} })()`);
}
async function readyModal(page: any) {
  await until(() => ui(page, `return root.querySelector('dialog').open && root.querySelector('dialog').getAttribute('aria-busy') !== 'true';`), 'modal ready');
  assert.equal(await ui(page, `return root.getElementById('error').textContent;`), '');
}
async function openManager(page: any) {
  await evaluate(page, `document.getElementById('justagram-switch-profile').click(); true`);
  await readyModal(page);
  await ui(page, `if (!root.getElementById('back').hidden) root.getElementById('back').click(); return true;`);
}
async function selectProfile(page: any, id: string) {
  await openManager(page);
  await ui(page, `Array.from(root.querySelectorAll('[data-profile-id]')).find(b => b.dataset.profileId === ${JSON.stringify(id)}).click(); return true;`);
}
async function openProfile(page: any, id: string) {
  await selectProfile(page, id);
  await ui(page, `root.getElementById('open').click(); return true;`);
  return readyPage(id);
}
async function restartApp() {
  await command('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  await Bun.sleep(500);
  await command('shell', 'am', 'force-stop', 'com.cleaninsta.app');
  await command('shell', 'am', 'start', '-n', 'com.cleaninsta.app/.MainActivity');
  await Bun.sleep(1500);
  const pid = await command('shell', 'pidof', 'com.cleaninsta.app');
  await command('forward', 'tcp:9223', `localabstract:webview_devtools_remote_${pid}`);
}
const marker = "justagram_profile_smoke_" + Date.now();
async function setMarkers(page: any, value: string) {
  assert.equal(
    (
      await cdp(page, "Network.setCookie", {
        name: marker,
        value,
        url: "https://justagram-profile-test.invalid/",
        httpOnly: true,
        secure: true,
        expires: Date.now() / 1000 + 3600,
      })
    ).success,
    true,
  );
  await evaluate(
    page,
    `localStorage.setItem('${marker}', ${JSON.stringify(value)}); true`,
  );
  await checkMarkers(page, value);
}
async function checkMarkers(page: any, value: string | null) {
  const result = await cdp(page, "Network.getCookies", {
    urls: ["https://justagram-profile-test.invalid/"],
  });
  assert.equal(
    await evaluate(page, `localStorage.getItem('${marker}')`),
    value,
    "website storage isolation/persistence",
  );
  assert.equal(
    result.cookies.find((c: any) => c.name === marker)?.value ?? null,
    value,
    "HttpOnly cookie isolation/persistence",
  );
}

async function clearMarkers(page: any) {
  await cdp(page, "Network.deleteCookies", {
    name: marker,
    url: "https://justagram-profile-test.invalid/",
  });
  await evaluate(page, `localStorage.removeItem('${marker}'); true`);
}


await restartApp();
let page = await readyPage();
const originalId = await evaluate(page, 'window.__JUSTAGRAM_DATA__.profileState.activeId');
const firstPageId = page.id;
console.log('PASS: startup automatically opens the remembered profile');
await setMarkers(page, 'original');
await openManager(page);
await ui(page, `root.getElementById('add').click(); root.getElementById('name').value = 'Modal test ${Date.now()}'; root.getElementById('name-form').requestSubmit(); return true;`);
await readyModal(page);
assert.equal(await ui(page, `return root.getElementById('actions-view').hidden;`), false);
const app = await shell();
const records = await evaluate(app, "JSON.parse(localStorage.getItem('justagram_profiles_v1'))");
const id = records.at(-1).id;
assert.notEqual(id, originalId);
assert.equal((await readyPage()).id, firstPageId, 'creating leaves the WebView open');
assert.equal(await evaluate(app, "localStorage.getItem('justagram_active_profile_v1')"), originalId);
console.log('PASS: modal creates a profile without leaving Instagram or changing the remembered profile');

await ui(page, `root.getElementById('open').click(); return true;`);
page = await readyPage(id);
await checkMarkers(page, null);
await setMarkers(page, 'disposable');
await openManager(page);
await selectProfile(page, id);
const beforeRename = page.id;
await ui(page, `root.getElementById('edit').click(); root.getElementById('name').value = 'Renamed modal test ${Date.now()}'; root.getElementById('name-form').requestSubmit(); return true;`);
await readyModal(page);
assert.equal((await readyPage(id)).id, beforeRename);
await checkMarkers(page, 'disposable');
console.log('PASS: rename preserves the browser, login cookies, and website storage');
await ui(page, `root.getElementById('delete').click(); root.getElementById('cancel-delete').click(); return true;`);
assert.equal(await ui(page, `return root.getElementById('actions-view').hidden;`), false);
await checkMarkers(page, 'disposable');
console.log('PASS: cancelling deletion keeps the active session');

await restartApp();
page = await readyPage(id);
await checkMarkers(page, 'disposable');
console.log('PASS: last opened profile and session automatically return after process restart');
page = await openProfile(page, originalId);
await checkMarkers(page, 'original');
page = await openProfile(page, id);
await checkMarkers(page, 'disposable');
console.log('PASS: switching isolates and restores both sessions');

await selectProfile(page, id);
await ui(page, `root.getElementById('delete').click(); root.getElementById('confirm-delete').click(); return true;`);
page = await readyPage('default');
await readyModal(page);
assert.equal(await ui(page, `return Array.from(root.querySelectorAll('[data-profile-id]')).some(b => b.dataset.profileId === ${JSON.stringify(id)});`), false);
console.log('PASS: deleting the active profile reopens the original store with the manager visible');

// Restore only disposable metadata to prove its native storage was really erased.
const reopenedShell = await shell();
await evaluate(reopenedShell, `(() => {const profiles = JSON.parse(localStorage.getItem('justagram_profiles_v1')); profiles.push({id:${JSON.stringify(id)},name:'Deletion verification',updatedAt:Date.now()});localStorage.setItem('justagram_profiles_v1',JSON.stringify(profiles));return true;})()`);
await ui(page, `root.getElementById('close').click(); return true;`);
page = await openProfile(page, id);
await checkMarkers(page, null);
page = await openProfile(page, originalId);
await checkMarkers(page, 'original');
await clearMarkers(page);
await selectProfile(page, id);
const originalPageId = page.id;
await ui(page, `root.getElementById('delete').click(); root.getElementById('confirm-delete').click(); return true;`);
await readyModal(page);
assert.equal((await readyPage(originalId)).id, originalPageId);
assert.equal(await ui(page, `return Array.from(root.querySelectorAll('[data-profile-id]')).some(b => b.dataset.profileId === ${JSON.stringify(id)});`), false);
console.log('PASS: native deletion clears the disposable store; deleting an inactive profile leaves Instagram open');
await ui(page, `root.getElementById('close').click(); return true;`);
console.log('Android profile smoke test passed. Original profile restored; disposable profile and markers removed.');
