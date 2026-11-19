import type { LoadedAssets, ProfileState } from "../../types";
import { ProfileService } from "./ProfileService";
import { SettingsService } from "./SettingsService";
import { ThemeService } from "./ThemeService";

export class BrowserService {
  private static browser: InAppBrowser | null = null;
  private static opening = false;
  private static switchingProfile = false;
  private static profileOperation = false;
  private static readonly INSTAGRAM_URL = "https://www.instagram.com/direct";
  private static readonly BROWSER_OPTIONS =
    "location=no,zoom=no,toolbar=no,footer=no,hardwareback=yes,disallowoverscroll=yes";

  public static async open(
    data: LoadedAssets,
    profileId: string,
    notice: Pick<ProfileState, "show" | "error"> = {},
  ): Promise<void> {
    if (this.browser || this.opening)
      throw new Error("Instagram is already open.");
    this.opening = true;
    try {
      await ProfileService.checkSupport(profileId);
      // Native preflight must succeed before changing the remembered selection.
      if (!ProfileService.getProfiles().some(profile => profile.id === profileId))
        throw new Error("Choose an existing profile.");
      this.browser = cordova.InAppBrowser.open(
        this.INSTAGRAM_URL,
        "_blank",
        `${this.BROWSER_OPTIONS},profile=${profileId}`,
      );
      ProfileService.setActiveProfile(profileId);
      this.setupEventListeners(this.browser, data, profileId, notice);
    } finally {
      this.opening = false;
    }
  }

  public static async close(): Promise<void> {
    const browser = this.browser;
    if (!browser) return;
    // Wait for native teardown before another profile can use the plugin.
    await new Promise<void>((resolve) => {
      browser.addEventListener("exit", () => resolve());
      browser.close();
    });
  }

  private static setupEventListeners(
    browser: InAppBrowser,
    data: LoadedAssets,
    profileId: string,
    notice: Pick<ProfileState, "show" | "error">,
  ): void {
    let instagramPage = false;
    browser.addEventListener("message", (event: any) => {
      if (this.browser !== browser) return;
      const message = event.data;
      if (!message) return;
      try {
        if (message.type === "saveSettings" && message.payload) {
          const saved = SettingsService.save(message.payload);
          if (!saved || !instagramPage) return;
          if (message.openInbox === true && message.payload.dmOnlyMode === true) {
            browser.insertScript({ code: `
              if (window.location.pathname === '/' && window.__JUSTAGRAM_DATA__?.settings.dmOnlyMode === true) {
                window.location.replace('/direct/inbox/');
              }
            ` });
          }
        } else if (
          message.type === "updateBackgroundColor" &&
          message.payload
        ) {
          ThemeService.updateBackgroundColor(message.payload);
        } else if (message.type === "switchProfile") {
          if (instagramPage) browser.insertScript({ code: "window.dispatchEvent(new Event('justagram-open-profiles'));" });
        } else if (message.type === "profiles" && instagramPage) {
          void this.handleProfileRequest(browser, data, profileId, message);
        }
      } catch (error) {
        console.error("[JustAgram] Error handling browser message", error);
      }
    });

    browser.addEventListener("loadstart", (event: { url: string }) => {
      if (this.browser !== browser) return;
      instagramPage = this.isInstagramUrl(event.url);
    });
    browser.addEventListener("loadstop", (event: { url: string }) => {
      if (this.browser !== browser || !this.isInstagramUrl(event.url)) return;
      instagramPage = true;
      // Login and logout cause full document loads. Inject into each fresh page,
      // and keep duplicate loadstop events from adding extra listeners or timers.
      const { injectedScripts, ...payload } = data;
      payload.settings = SettingsService.load();
      payload.profileState = { ...this.profileState(profileId), ...notice };
      browser.insertCSS({ code: data.cssGlobal });
      browser.insertScript({
        code: `
        (function () {
          if (window.__JUSTAGRAM_INITIALIZED__) return;
          window.__JUSTAGRAM_INITIALIZED__ = true;
          window.__JUSTAGRAM_DATA__ = ${JSON.stringify(payload)};
          ${injectedScripts.join("\n;\n")}
        })();
      `,
      });
      // A transition notice belongs to the first document only.
      notice = {};
    });

    browser.addEventListener("loaderror", () => {
      if (this.browser !== browser) return;
      void this.close().then(() => {
        window.dispatchEvent(
          new CustomEvent("justagram-browser-error", {
            detail: new Error(
              "Instagram could not load. Check your connection and try again.",
            ),
          }),
        );
      });
    });

    browser.addEventListener("exit", () => {
      if (this.browser !== browser) return;
      this.browser = null;
      if (!this.switchingProfile) {
        window.dispatchEvent(new Event("justagram-browser-closed"));
      }
    });
  }

  private static profileState(activeId: string): ProfileState {
    return {
      profiles: ProfileService.getProfiles().map(({ id, name }) => ({ id, name })),
      activeId,
    };
  }

  private static async handleProfileRequest(
    browser: InAppBrowser,
    data: LoadedAssets,
    activeId: string,
    message: { requestId?: unknown; action?: unknown; id?: unknown; name?: unknown },
  ): Promise<void> {
    if (typeof message.requestId !== "string" || message.requestId.length > 100) return;
    const respond = (extra: { selectedId?: string; error?: string } = {}) => {
      if (this.browser !== browser) return;
      const detail = { ...this.profileState(activeId), requestId: message.requestId, ...extra };
      browser.insertScript({ code: `window.dispatchEvent(new CustomEvent('justagram-profiles-result', { detail: ${JSON.stringify(detail)} }));` });
    };
    if (this.profileOperation) {
      respond({ error: "A profile is already being updated. Please try again." });
      return;
    }
    this.profileOperation = true;
    try {
      const id = typeof message.id === "string" ? message.id : "";
      const name = typeof message.name === "string" ? message.name : "";
      switch (message.action) {
        case "list":
          respond();
          break;
        case "create": {
          await ProfileService.checkSupport(crypto.randomUUID());
          const profile = ProfileService.createProfile(name);
          respond({ selectedId: profile.id });
          break;
        }
        case "rename":
          ProfileService.renameProfile(id, name);
          respond({ selectedId: id });
          break;
        case "open":
          if (!ProfileService.getProfiles().some(profile => profile.id === id))
            throw new Error("Choose an existing profile.");
          if (id === activeId) respond();
          else await this.replaceProfile(data, activeId, id);
          break;
        case "remove":
          if (id === "default") throw new Error("The original profile can be renamed but cannot be deleted.");
          if (id === activeId) await this.replaceProfile(data, activeId, "default", true);
          else {
            await ProfileService.removeProfile(id);
            respond();
          }
          break;
        default:
          throw new Error("Unknown profile action.");
      }
    } catch (cause) {
      respond({ error: cause instanceof Error ? cause.message : "Unable to update this profile. Please try again." });
    } finally {
      this.profileOperation = false;
    }
  }

  private static async replaceProfile(
    data: LoadedAssets,
    previousId: string,
    nextId: string,
    removeCurrent = false,
  ): Promise<void> {
    // Keep the current page open if the requested store is unsupported.
    await ProfileService.checkSupport(nextId);
    this.switchingProfile = true;
    try {
      await this.close();
      if (removeCurrent) await ProfileService.removeProfile(previousId);
      await this.open(data, nextId, { show: removeCurrent });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error("Unable to switch profiles.");
      // A failed deletion retains the old profile. Reopen it with the error in
      // the modal; after a successful deletion the remembered ID is Default.
      try {
        await this.open(data, ProfileService.getActiveProfileId(), { show: true, error: error.message });
      } catch {
        window.dispatchEvent(new CustomEvent("justagram-browser-error", { detail: error }));
      }
      throw error;
    } finally {
      this.switchingProfile = false;
    }
  }

  private static isInstagramUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        parsed.protocol === "https:" &&
        (parsed.hostname === "instagram.com" ||
          parsed.hostname.endsWith(".instagram.com"))
      );
    } catch {
      return false;
    }
  }
}
