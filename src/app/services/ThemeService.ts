import { StatusBar, Style } from "@capacitor/status-bar";

export class ThemeService {
  public static async init(): Promise<void> {
    // Set status bar to overlay webview so it uses body background color
    if (typeof cordova !== "undefined") {
      try {
        await StatusBar.setOverlaysWebView({ overlay: true });
        await StatusBar.setStyle({ style: Style.Dark });
      } catch (e) {
        console.warn(
          "[JustAgram] StatusBar plugin not available or failed:",
          e,
        );
      }
    }
  }

  public static updateBackgroundColor(hexColor: string): void {
    // Set main app body background
    document.body.style.backgroundColor = hexColor;

    // Update status bar style based on brightness
    // Convert hex to RGB to calculate brightness
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    if (brightness > 128) {
      StatusBar.setStyle({ style: Style.Default }).catch(() => {}); // Dark icons for light bg
    } else {
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {}); // Light icons for dark bg
    }
  }
}
