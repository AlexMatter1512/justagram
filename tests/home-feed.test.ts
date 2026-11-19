import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const transpiler = new Bun.Transpiler({ loader: "ts" });
const feedStyle = readFileSync(new URL("../src/injected/css/rules/hideFeed.css", import.meta.url), "utf8");
const scripts = ["handler_home", "patch_fetch", "patch_pushState", "app_settings_css"].map(name =>
  transpiler.transformSync(readFileSync(new URL(`../src/injected/ts/${name}.ts`, import.meta.url), "utf8")),
).join("\n");

function enterHome(hideFeed: boolean) {
  const location = { pathname: "/", reload: mock(() => {}) };
  const history = {
    pushState(_state: unknown, _title: string, path: string) { location.pathname = path; },
    replaceState(_state: unknown, _title: string, path: string) { location.pathname = path; },
  };
  const classes = new Set<string>();
  const main = { remove: mock(() => {}) };
  let stylesheet: { textContent: string; remove(): void } | undefined;
  const document = {
    head: { appendChild: (style: typeof stylesheet) => { stylesheet = style; } },
    createElement: () => ({ textContent: "", remove() { stylesheet = undefined; } }),
    getElementById: () => stylesheet,
    documentElement: {
      classList: {
        toggle(name: string, enabled: boolean) {
          if (enabled) classes.add(name);
          else classes.delete(name);
        },
      },
    },
    querySelector: () => main,
  };
  class XHR {
    status = 0;
    open(_method: string, _url: string) {}
    send() { this.status = 200; }
  }
  const settings = { hideFeed };
  const page = Object.assign(new EventTarget(), {
    location,
    fetch: async (_url: string) => new Response(null, { status: 200 }),
    XMLHttpRequest: XHR,
    __JUSTAGRAM_DATA__: { settings, cssRules: { hideFeed: feedStyle }, blockMap: { "/": ["graphql"] } },
  });
  const timers: Array<() => void> = [];
  runInNewContext(scripts, {
    window: page, document, history, Event, Response,
    setTimeout: (callback: () => void) => timers.push(callback),
  });
  timers.splice(0).forEach(callback => callback());

  function toggle(hidden: boolean) {
    settings.hideFeed = hidden;
    page.dispatchEvent(new CustomEvent("justagram-settings-changed", { detail: settings }));
  }
  function saved() {
    page.dispatchEvent(new Event("justagram-feed-visible-saved"));
  }
  function feedStyleActive() {
    return classes.has("justagram-home") && stylesheet?.textContent.includes(feedStyle) === true;
  }
  return { page, history, feedStyleActive, main, reload: location.reload, toggle, saved };
}

describe("Home feed filtering", () => {
  test("keeps the mounted feed and unblocks requests immediately without reloading", async () => {
    const { page, feedStyleActive, main, reload, toggle, saved } = enterHome(false);
    toggle(true);
    expect(feedStyleActive()).toBe(true);
    expect(main.remove).not.toHaveBeenCalled();
    toggle(false);
    expect(feedStyleActive()).toBe(false);
    expect((await page.fetch("/graphql/query")).status).toBe(200);
    saved();
    expect(reload).not.toHaveBeenCalled();
  });

  for (const transport of ["fetch", "XHR"]) {
    test(`restores a hidden initial Home after a blocked ${transport} and a successful save`, async () => {
      const { page, feedStyleActive, history, reload, toggle, saved } = enterHome(true);
      expect(feedStyleActive()).toBe(true);
      if (transport === "fetch") {
        expect((await page.fetch("/graphql/query")).status).toBe(500);
      } else {
        const xhr = new page.XMLHttpRequest();
        xhr.open("GET", "/graphql/query");
        xhr.send();
        expect(xhr.status).toBe(500);
      }
      history.replaceState(null, "", "/");
      toggle(false);
      expect(feedStyleActive()).toBe(false);
      expect(reload).not.toHaveBeenCalled();
      expect((await page.fetch("/graphql/query")).status).toBe(200);
      saved();
      saved();
      expect(reload).toHaveBeenCalledTimes(1);
    });
  }

  test("leaving hidden Home releases the next page and defers any recovery until Home", async () => {
    const { page, feedStyleActive, history, reload, toggle, saved } = enterHome(true);
    expect(feedStyleActive()).toBe(true);
    expect((await page.fetch("/graphql/query")).status).toBe(500);
    history.pushState(null, "", "/direct/inbox/");
    expect(feedStyleActive()).toBe(false);
    expect((await page.fetch("/graphql/query")).status).toBe(200);
    toggle(false);
    saved();
    expect(reload).not.toHaveBeenCalled();
    page.location.pathname = "/";
    page.dispatchEvent(new Event("popstate"));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
