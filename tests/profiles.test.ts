import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { ProfileService } from "../src/app/services/ProfileService";
import { BrowserService } from "../src/app/services/BrowserService";
import type { LoadedAssets } from "../src/types";

const profileKey = "justagram_profiles_v1";
const activeKey = "justagram_active_profile_v1";
const id = "b7930db9-1512-49e6-b940-821625278351";
const storage = new Map<string, string>();
const browsers: FakeBrowser[] = [];
let nativeError: string | null;
const nativeCalls: Array<{ action: string; args: string[] }> = [];
let appEvents: EventTarget;
const openBrowser = mock((_url: string, _target: string, _options: string) => {
  const browser = new FakeBrowser();
  browsers.push(browser);
  return browser;
});
class FakeBrowser {
  private listeners = new Map<string, Array<(event: any) => void>>();
  scripts: string[] = [];
  addEventListener(name: string, listener: (event: any) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) || []), listener]);
  }
  emit(name: string, event: any = {}) {
    for (const listener of this.listeners.get(name) || []) listener(event);
  }
  close() {
    this.emit("exit");
  }
  insertCSS() {}
  insertScript({ code }: { code: string }) {
    this.scripts.push(code);
  }
}
const data: LoadedAssets = {
  menuHTML: "",
  menuButtonHTML: "",
  cssRules: {} as LoadedAssets["cssRules"],
  cssGlobal: "",
  blockMap: {},
  version: "test",
  settings: {
    hideReels: true,
    hideStories: true,
    hideExplore: true,
    hideFeed: true,
    hideSuggestedReels: true,
    hideThreads: true,
    hideNotes: true,
    dmOnlyMode: true,
  },
  injectedScripts: [
    "window.injectionCount = (window.injectionCount || 0) + 1;",
  ],
};

beforeEach(() => {
  storage.clear();
  browsers.length = 0;
  openBrowser.mockClear();
  nativeError = null;
  nativeCalls.length = 0;
  appEvents = new EventTarget();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    window: appEvents,
    cordova: {
      exec: (
        success: () => void,
        failure: (error: string) => void,
        _service: string,
        action: string,
        args: string[],
      ) => {
        nativeCalls.push({ action, args });
        if (nativeError) failure(nativeError);
        else success();
      },
      InAppBrowser: { open: openBrowser },
    },
  });
});
afterEach(async () => {
  await BrowserService.close();
});

describe("profile metadata", () => {
  test("initializes Default and recovers a stale remembered selection", () => {
    storage.set(activeKey, "missing");
    ProfileService.ensureDefaultProfile();
    expect(ProfileService.getProfiles().map((p) => p.id)).toEqual(["default"]);
    expect(ProfileService.getActiveProfileId()).toBe("default");
  });
  test("recovers malformed records and drops legacy cookie strings", () => {
    storage.set(
      profileKey,
      JSON.stringify([
        null,
        {},
        { id, name: "Work", cookies: "secret" },
        { id, name: "Duplicate" },
        { id: "injected,profile=default", name: "Invalid" },
      ]),
    );
    ProfileService.ensureDefaultProfile();
    expect(ProfileService.getProfiles().map((p) => p.name)).toEqual([
      "Default",
      "Work",
    ]);
    expect(storage.get(profileKey)).not.toContain("secret");
    storage.set(profileKey, "{broken");
    expect(ProfileService.getProfiles()[0]?.id).toBe("default");
  });
  test("creates persistent UUID profiles and remembers selection", () => {
    const work = ProfileService.createProfile("  Work  ");
    ProfileService.setActiveProfile(work.id);
    expect(work.name).toBe("Work");
    expect(work.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ProfileService.getActiveProfileId()).toBe(work.id);
    expect(ProfileService.getProfiles()).toContainEqual(work);
  });
  test("rejects duplicate, blank, and overlong names without adding profiles", () => {
    expect(() => ProfileService.createProfile("default")).toThrow(
      "already exists",
    );
    expect(() => ProfileService.createProfile("  ")).toThrow(
      "between 1 and 40",
    );
    expect(() => ProfileService.createProfile("x".repeat(41))).toThrow(
      "between 1 and 40",
    );
    expect(ProfileService.getProfiles()).toHaveLength(1);
  });
  test("rejects missing IDs and browser-option injection", async () => {
    expect(() => ProfileService.setActiveProfile("missing")).toThrow();
    await expect(
      ProfileService.checkSupport("default,clearcache=yes"),
    ).rejects.toThrow();
  });
});

describe("profile management", () => {
  test("renaming preserves ID, remembered selection, and the native session", () => {
    const profile = ProfileService.createProfile("Work");
    ProfileService.setActiveProfile(profile.id);
    const renamed = ProfileService.renameProfile(profile.id, "  Business  ");
    expect(renamed.id).toBe(profile.id);
    expect(renamed.name).toBe("Business");
    expect(ProfileService.getActiveProfileId()).toBe(profile.id);
    expect(ProfileService.getProfiles()).toContainEqual(renamed);
    expect(nativeCalls).toHaveLength(0);
  });
  test("allows renaming the original profile and changing only name casing", () => {
    ProfileService.renameProfile("default", "Personal");
    ProfileService.renameProfile("default", "PERSONAL");
    ProfileService.ensureDefaultProfile();
    expect(ProfileService.getProfiles().map((p) => p.name)).toEqual([
      "PERSONAL",
    ]);
  });
  test("rejects duplicate, invalid, and missing-profile renames without changing metadata", () => {
    const profile = ProfileService.createProfile("Work");
    const before = storage.get(profileKey);
    expect(() => ProfileService.renameProfile(profile.id, "DEFAULT")).toThrow(
      "already exists",
    );
    expect(() => ProfileService.renameProfile(profile.id, " ")).toThrow(
      "between 1 and 40",
    );
    expect(() =>
      ProfileService.renameProfile(profile.id, "x".repeat(41)),
    ).toThrow("between 1 and 40");
    expect(() => ProfileService.renameProfile("missing", "Personal")).toThrow(
      "existing profile",
    );
    expect(storage.get(profileKey)).toBe(before);
  });
  test("removes native session before metadata and resets a deleted selection", async () => {
    const profile = ProfileService.createProfile("Work");
    ProfileService.setActiveProfile(profile.id);
    let finish!: () => void;
    cordova.exec = (success) => {
      finish = success;
    };
    const removal = ProfileService.removeProfile(profile.id);
    expect(ProfileService.getProfiles()).toContainEqual(profile);
    expect(ProfileService.getActiveProfileId()).toBe(profile.id);
    finish();
    await removal;
    expect(ProfileService.getProfiles().map((p) => p.id)).toEqual(["default"]);
    expect(ProfileService.getActiveProfileId()).toBe("default");
  });
  test("removing another profile preserves the remembered selection", async () => {
    const work = ProfileService.createProfile("Work");
    const personal = ProfileService.createProfile("Personal");
    ProfileService.setActiveProfile(personal.id);
    await ProfileService.removeProfile(work.id);
    expect(nativeCalls).toEqual([{ action: "removeProfile", args: [work.id] }]);
    expect(ProfileService.getActiveProfileId()).toBe(personal.id);
    expect(ProfileService.getProfiles().map((p) => p.id)).toEqual([
      "default",
      personal.id,
    ]);
  });
  test("native deletion failure retains the profile and selection", async () => {
    const profile = ProfileService.createProfile("Work");
    ProfileService.setActiveProfile(profile.id);
    nativeError = "Session is still in use";
    await expect(ProfileService.removeProfile(profile.id)).rejects.toThrow(
      "still in use",
    );
    expect(ProfileService.getProfiles()).toContainEqual(profile);
    expect(ProfileService.getActiveProfileId()).toBe(profile.id);
  });
  test("protects the original profile even after renaming and rejects unknown IDs", async () => {
    ProfileService.renameProfile("default", "Personal");
    await expect(ProfileService.removeProfile("default")).rejects.toThrow(
      "cannot be removed",
    );
    await expect(ProfileService.removeProfile("missing")).rejects.toThrow(
      "existing profile",
    );
    expect(nativeCalls).toHaveLength(0);
    expect(ProfileService.getProfiles()).toHaveLength(1);
  });
});

describe("native browser lifecycle", () => {
  test("does not open a shared session when isolation is unsupported", async () => {
    const profile = ProfileService.createProfile("Work");
    nativeError = "Additional profiles require iOS 17 or later.";
    await expect(BrowserService.open(data, profile.id)).rejects.toThrow(
      "iOS 17",
    );
    expect(openBrowser).not.toHaveBeenCalled();
    expect(ProfileService.getActiveProfileId()).toBe("default");
  });
  test("fails clearly on desktop instead of pretending sessions are isolated", async () => {
    Object.assign(globalThis, { cordova: undefined });
    await expect(BrowserService.open(data, "default")).rejects.toThrow(
      "Android or iOS",
    );
    expect(openBrowser).not.toHaveBeenCalled();
  });
  test("opens with the chosen profile and prevents duplicate windows", async () => {
    const profile = ProfileService.createProfile("Work");
    await BrowserService.open(data, profile.id);
    expect(openBrowser.mock.calls[0]?.[2]).toContain(`profile=${profile.id}`);
    expect(ProfileService.getActiveProfileId()).toBe(profile.id);
    await expect(BrowserService.open(data, "default")).rejects.toThrow(
      "already open",
    );
    expect(browsers).toHaveLength(1);
  });
  async function request(browser: FakeBrowser, action: string, payload: Record<string, string> = {}) {
    browser.emit("message", { data: { type: "profiles", requestId: "test", action, ...payload } });
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  function response(browser: FakeBrowser): any {
    let detail: unknown;
    const target = new EventTarget();
    target.addEventListener("justagram-profiles-result", event => { detail = (event as CustomEvent).detail; });
    runInNewContext(browser.scripts.at(-1)!, { window: target, CustomEvent });
    return detail;
  }
  async function openDefault() {
    await BrowserService.open(data, "default");
    const browser = browsers[0]!;
    browser.emit("loadstop", { url: "https://www.instagram.com/direct/" });
    return browser;
  }
  test("opening the manager keeps the current browser and supplies profile metadata", async () => {
    const closed = mock(() => {});
    appEvents.addEventListener("justagram-browser-closed", closed);
    const browser = await openDefault();
    browser.emit("message", { data: { type: "switchProfile" } });
    expect(browser.scripts.at(-1)).toContain("justagram-open-profiles");
    await request(browser, "list");
    expect(response(browser)).toMatchObject({ activeId: "default", profiles: [{ id: "default", name: "Default" }] });
    expect(closed).not.toHaveBeenCalled();
    expect(browsers).toHaveLength(1);
  });
  test("creating, renaming, and deleting an inactive profile leave the current session open", async () => {
    const browser = await openDefault();
    await request(browser, "create", { name: "Work" });
    const created = response(browser).selectedId;
    expect(created).toBeString();
    expect(ProfileService.getActiveProfileId()).toBe("default");
    await request(browser, "rename", { id: created, name: "Business" });
    expect(response(browser).profiles).toContainEqual({ id: created, name: "Business" });
    await request(browser, "remove", { id: created });
    expect(response(browser).profiles).toEqual([{ id: "default", name: "Default" }]);
    expect(browsers).toHaveLength(1);
  });
  test("opening the current profile leaves its browser intact", async () => {
    const browser = await openDefault();
    await request(browser, "open", { id: "default" });
    expect(response(browser).error).toBeUndefined();
    expect(browsers).toHaveLength(1);
  });
  test("switching stores remembers the new profile without exposing the startup page", async () => {
    const closed = mock(() => {});
    appEvents.addEventListener("justagram-browser-closed", closed);
    const work = ProfileService.createProfile("Work");
    const browser = await openDefault();
    await request(browser, "open", { id: work.id });
    expect(openBrowser.mock.calls[1]?.[2]).toEndWith(`profile=${work.id}`);
    expect(ProfileService.getActiveProfileId()).toBe(work.id);
    expect(closed).not.toHaveBeenCalled();
  });
  test("unsupported switching reports an error in the modal and preserves the session", async () => {
    const browser = await openDefault();
    const work = ProfileService.createProfile("Work");
    nativeError = "Profiles unavailable";
    await request(browser, "open", { id: work.id });
    expect(response(browser).error).toBe("Profiles unavailable");
    expect(ProfileService.getActiveProfileId()).toBe("default");
    expect(browsers).toHaveLength(1);
  });
  test("deleting the active profile closes it before native deletion, then opens Default", async () => {
    const work = ProfileService.createProfile("Work");
    await BrowserService.open(data, work.id);
    const browser = browsers[0]!;
    browser.emit("loadstop", { url: "https://www.instagram.com/direct/" });
    let closed = false;
    browser.addEventListener("exit", () => { closed = true; });
    const exec = cordova.exec;
    cordova.exec = (...args) => {
      if (args[3] === "removeProfile") expect(closed).toBe(true);
      exec(...args);
    };
    await request(browser, "remove", { id: work.id });
    expect(ProfileService.getProfiles()).toHaveLength(1);
    expect(ProfileService.getActiveProfileId()).toBe("default");
    expect(openBrowser.mock.calls[1]?.[2]).toEndWith("profile=default");
    browsers[1]!.emit("loadstop", { url: "https://www.instagram.com/direct/" });
    expect(browsers[1]!.scripts.at(-1)).toContain('"show":true');
  });
  test("failed active deletion reopens the original session and explains the failure", async () => {
    const work = ProfileService.createProfile("Work");
    await BrowserService.open(data, work.id);
    const browser = browsers[0]!;
    browser.emit("loadstop", { url: "https://www.instagram.com/direct/" });
    const exec = cordova.exec;
    cordova.exec = (...args) => {
      if (args[3] === "removeProfile") args[1]("Unable to delete session");
      else exec(...args);
    };
    await request(browser, "remove", { id: work.id });
    expect(ProfileService.getProfiles()).toContainEqual(work);
    expect(ProfileService.getActiveProfileId()).toBe(work.id);
    expect(openBrowser.mock.calls[1]?.[2]).toEndWith(`profile=${work.id}`);
    browsers[1]!.emit("loadstop", { url: "https://www.instagram.com/direct/" });
    expect(browsers[1]!.scripts.at(-1)).toContain('"error":"Unable to delete session"');
  });
  test("invalid actions and duplicate names report errors without changing profiles", async () => {
    const browser = await openDefault();
    await request(browser, "create", { name: "default" });
    expect(response(browser).error).toContain("already exists");
    await request(browser, "open", { id: "unknown" });
    expect(response(browser).error).toContain("existing profile");
    await request(browser, "remove", { id: "default" });
    expect(response(browser).error).toContain("cannot be deleted");
    expect(ProfileService.getProfiles()).toHaveLength(1);
    expect(browsers).toHaveLength(1);
  });
  test("ignores profile messages from an external document", async () => {
    const browser = await openDefault();
    browser.emit("loadstart", { url: "https://example.com/" });
    await request(browser, "create", { name: "Untrusted" });
    expect(ProfileService.getProfiles()).toHaveLength(1);
  });
  test("injects once per document, reinjects after login, and ignores external pages", async () => {
    await BrowserService.open(data, "default");
    const browser = browsers[0]!;
    browser.emit("loadstop", { url: "https://example.com" });
    expect(browser.scripts).toHaveLength(0);
    browser.emit("loadstop", {
      url: "https://www.instagram.com/accounts/login/",
    });
    browser.emit("loadstop", { url: "https://www.instagram.com/direct/" });
    const firstPage = { window: {} as Record<string, unknown> };
    runInNewContext(browser.scripts[0]!, firstPage);
    runInNewContext(browser.scripts[1]!, firstPage);
    expect(firstPage.window.injectionCount).toBe(1);
    const nextPage = { window: {} as Record<string, unknown> };
    runInNewContext(browser.scripts[1]!, nextPage);
    expect(nextPage.window.injectionCount).toBe(1);
    expect(nextPage.window.__JUSTAGRAM_DATA__).not.toHaveProperty(
      "injectedScripts",
    );
  });
  test("load failure closes the browser and reports an actionable error", async () => {
    const error = mock(() => {});
    appEvents.addEventListener("justagram-browser-error", error);
    await BrowserService.open(data, "default");
    browsers[0]!.emit("loaderror");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(error).toHaveBeenCalledTimes(1);
    await BrowserService.open(data, "default");
    expect(browsers).toHaveLength(2);
  });
});
