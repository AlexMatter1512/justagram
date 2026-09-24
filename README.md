# JustAgram

**Instagram, but *just a gram* at a time.**

JustAgram is a distraction-free wrapper for Instagram designed to kill the doomscroll. It allows you to toggle exactly what you want to see—hiding Reels, the Explore page, Stories, and the Home feed, or keeping what you need.

Why "JustAgram"? Because you should ideally use it *just a gram* at a time, not kilos of brainrot content per hour. 😉

## 📸 Screenshots
<p align="center">
  <img src="screenshots/feed.jpg" width="180" alt="Clean Feed">
  <img src="screenshots/menu.jpg" width="180" alt="Settings Menu">
  <img src="screenshots/search.jpg" width="180" alt="Clean Search">
</p>

## ✨ Features
- **Toggleable Filters:** Choose what to hide: Reels, Stories, Explore, Feed, Suggested Reels, or Threads.
- **Floating Settings:** Access preferences directly within the app via a floating menu button.
- **Persistent Settings:** Your preferences are saved automatically using `localStorage`.
- **Modular Design:** Modular CSS rules for easy maintenance and updates.

## 📥 Installation
If you find this useful, click ⭐ in the top-right of the page to support the project.

[![GitHub stars](https://img.shields.io/github/stars/AlexMatter1512/justagram?style=social)](https://github.com/AlexMatter1512/justagram)
### Android:
[**Download the latest APK from Releases**](../../releases) or build it yourself using the instructions below.
### iOS:
Currently you can only build it yourself using the instructions below.

---

## 🛠 How It Works
This application is a **CapacitorJS** container that loads the mobile Instagram website via [my fork of `cordova-plugin-inappbrowser`](https://github.com/AlexMatter1512/cordova-plugin-inappbrowser) that enables script injection.

It uses **Bun** to bundle TypeScript sources into the final web assets:
1.  **Main App:** `src/app/main.ts` manages the Capacitor app lifecycle and persistent settings.
2.  **Injected Script:** `src/injected/ts/addmenu.ts` is bundled and injected into the Instagram webview to render the UI and communicate with the main app.
3.  **Modular CSS:** Individual filter rules are loaded dynamically based on user settings.

## 💻 Development
Built with **Bun** and **TypeScript**.

### Prerequisites
- [Bun](https://bun.sh/) (Runtime & Bundler)
- Android Studio (for Android development)
- Xcode (for iOS development)

### Commands
```bash
# Install dependencies
bun install

# Build TypeScript sources, generate AssetManifest, and copy assets to www/
bun run build

# Sync web assets to native projects
bun run sync

# Open native project in IDE
bun run open:android
bun run open:ios
```

### Folder Structure
- [`src/`](src/): TypeScript source code
    - [`app/`](src/app/): Main application logic (`main.ts`) and styles.
    - [`injected/`](src/injected/): Code injected into Instagram.
        - [`ts/`](src/injected/ts/): TypeScript logic (`addmenu.ts`) for the settings menu.
        - [`css/rules/`](src/injected/css/rules/): Individual CSS filter rules.
        - [`html/`](src/injected/html/): HTML templates.
    - [`types/`](src/types/): Shared TypeScript definitions.
- [`www/`](www/): Compiled output (do not edit directly).
- [`android/`](android/): Android native project.
- [`ios/`](ios/): iOS native project.

## Instagram profiles

JustAgram opens the last used profile directly at startup. On the first launch it
creates **Default**, preserving any existing Instagram session.

Tap the account name at the top of the profile page or DM inbox, or choose
**Switch profile** in JustAgram settings, to open the profile modal over Instagram.
Select a profile to open it, edit its name, or delete it with confirmation. Use
**Add a profile** to create a separate login, then open it to sign in. Browsing,
creating, and renaming profiles leave the current page open. Opening a different
profile replaces the native browser so its isolated session is used.

The menu is also available on Instagram's login/account pages, so you can leave a
new profile before signing in. Filter preferences currently apply to all profiles.

Profile names and stable IDs are saved by `ProfileService` in the app's local
storage. Login cookies are not copied into JavaScript storage. Each additional
profile uses a separate persistent native browser store, including cookies and
website storage. Default continues to use the original browser store.

Additional profiles require an Android System WebView supporting AndroidX
`MULTI_PROFILE`, or iOS 17+. Unsupported devices show an error and can still use
Default. A desktop browser cannot open native profiles.
The native implementation follows [Android WebView profiles](https://developer.android.com/reference/androidx/webkit/WebViewCompat#setProfile(android.webkit.WebView,java.lang.String))
and [WebKit persistent data stores](https://webkit.org/blog/14423/building-profiles-with-new-webkit-api/).

The InAppBrowser extensions are tracked in `patches/` via Bun's
`patchedDependencies`. Run `bun install` to apply them, followed by `bun run sync`
and a native rebuild. Keep the patch when updating the plugin; it adds the
`checkProfile` action and `profile` browser option on Android and iOS.

Validation:

```sh
bun test tests
bun run check
bun run sync
```

On a device, verify: Default retains its login; a new profile starts logged out;
switching back restores the original session; both profiles persist after an app
restart; logging out of one profile leaves the other signed in.

With the debug APK installed on a running Android emulator,
`bun run scripts/test-android-profiles.ts` exercises automatic startup, the modal,
profile creation, rename, cancellation, switching, deletion, isolated HttpOnly
test cookies and localStorage, and persistence after a process restart. It uses a
disposable profile and restores the original active profile. No login credentials
are required. Set `ANDROID_SERIAL` for a different device and `ANDROID_HOME`
(or `ADB_PATH`) for a non-default SDK installation. The test uses local debugger
port 9223 and a test-only cookie domain.

Renaming preserves the Instagram login. Deletion removes a profile's saved
browser session; cancelling leaves it intact. Deleting the active profile opens
the original profile and its profile modal. The original profile can be renamed
but cannot be deleted because its native browser store is shared with the app.
A failed deletion keeps the profile available and shows an error in the modal.
If Instagram cannot open at all, the app shows retry controls instead of a picker.

Android clears a recently used profile's cookies and website data immediately,
then prunes its empty native store on a later launch. Older WebViews without the
data-clearing API require an Android System WebView update before removing a
previously opened profile.
