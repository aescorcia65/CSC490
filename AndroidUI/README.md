# CSC490 AndroidUI

Kotlin Android app template for the project. Uses **Kotlin**, **View Binding**, and **Material Components**.

## Requirements

- **Android Studio** (Ladybug 2024.2.1 or newer, or the latest stable)
- **JDK 17** (Android Studio usually bundles this)
- An **Android device** or **emulator** (API 26+)

## Getting started

**1. Open the project in Android Studio**

- Open Android Studio → **File → Open**
- Select the **`AndroidUI`** folder (the one that contains `build.gradle.kts` and `app`)
- Click **Open**
- Wait for Gradle sync to finish (first time may take a few minutes)

**2. Run the app**

- Connect a device or start an emulator (**Tools → Device Manager**)
- Click the **Run** button (green triangle) or press **Shift+F10**
- Pick your device/emulator and confirm

The template app shows a single screen with a welcome message.

---

## Project structure

```
AndroidUI/
├── app/
│   ├── build.gradle.kts       # App module: SDK version, dependencies
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/csc490/androidui/
│       │   └── MainActivity.kt
│       └── res/
│           ├── drawable/       # Icons, vectors
│           ├── layout/        # activity_main.xml
│           └── values/        # strings, colors, themes
├── build.gradle.kts           # Root: Android & Kotlin plugin versions
├── settings.gradle.kts        # Project name, included modules
├── gradle.properties
└── gradle/wrapper/             # Gradle version used for builds
```

| Part | Purpose |
|------|--------|
| **app/build.gradle.kts** | App-level config: `minSdk`, `targetSdk`, dependencies |
| **AndroidManifest.xml** | Declares app name, launcher activity, permissions |
| **MainActivity.kt** | Main (launcher) activity; uses View Binding |
| **res/layout/** | XML layouts for each screen |
| **res/values/** | Strings, colors, themes (use these instead of hardcoding) |

---

## Useful commands (terminal)

From the **`AndroidUI`** directory (same folder as `build.gradle.kts`):

| Command | What it does |
|---------|----------------|
| `./gradlew assembleDebug` | Build debug APK |
| `./gradlew installDebug` | Build and install on connected device/emulator |
| `./gradlew clean` | Delete build outputs |

On Windows use `gradlew.bat` instead of `./gradlew`.

---

## Tips for the group

- **New screen:** add an Activity (or Fragment), a layout in `res/layout/`, and register the Activity in `AndroidManifest.xml`.
- **Strings:** put user-visible text in `res/values/strings.xml` for easier changes and localization.
- **Dependencies:** add libraries in `app/build.gradle.kts` in the `dependencies { }` block, then sync.
- **Launcher icon:** replace `res/drawable/ic_launcher_foreground.xml` or add proper mipmap icons (e.g. via **File → New → Image Asset** in Android Studio).
