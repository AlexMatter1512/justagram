import { AssetService } from "./services/AssetService";
import { BrowserService } from "./services/BrowserService";
import { ProfileService } from "./services/ProfileService";
import { ThemeService } from "./services/ThemeService";

if (typeof cordova !== "undefined") {
  document.addEventListener("deviceready", () => void onDeviceReady(), false);
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void onDeviceReady());
} else {
  void onDeviceReady();
}

async function onDeviceReady(): Promise<void> {
  const status = document.getElementById("startup-status")!;
  const error = document.getElementById("startup-error")!;
  const retry = document.getElementById("launch-btn") as HTMLButtonElement;
  const fallback = document.getElementById("fallback-btn") as HTMLButtonElement;
  let busy = false;

  function showError(cause: unknown): void {
    busy = false;
    error.textContent = cause instanceof Error ? cause.message : "Unable to open Instagram. Please try again.";
    status.textContent = "Instagram could not open.";
    retry.hidden = false;
    retry.disabled = false;
    fallback.hidden = ProfileService.getActiveProfileId() === "default";
    fallback.disabled = false;
  }

  async function launch(profileId = ProfileService.getActiveProfileId()): Promise<void> {
    if (busy) return;
    busy = true;
    error.textContent = "";
    status.textContent = "Opening Instagram…";
    retry.hidden = true;
    fallback.hidden = true;
    try {
      const data = await AssetService.loadAssets();
      if (!data) throw new Error("Unable to load JustAgram. Please try again.");
      await BrowserService.open(data, profileId);
      status.textContent = "Instagram is open.";
    } catch (cause) {
      showError(cause);
    }
  }

  retry.addEventListener("click", () => void launch());
  fallback.addEventListener("click", () => void launch("default"));
  window.addEventListener("justagram-browser-closed", () => {
    busy = false;
    document.body.style.backgroundColor = "";
    void ThemeService.init();
    status.textContent = "Ready when you are.";
    retry.hidden = false;
    retry.disabled = false;
  });
  window.addEventListener("justagram-browser-error", event => {
    showError((event as CustomEvent<Error>).detail);
  });

  try {
    await ThemeService.init();
    ProfileService.ensureDefaultProfile();
    const original = ProfileService.getProfiles().find(profile => profile.id === "default")!;
    fallback.textContent = `Open ${original.name}`;
    await launch();
  } catch (cause) {
    showError(cause);
  }
}
