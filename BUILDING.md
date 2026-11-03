# Build Markpad installers

Markpad builds with `electron-builder`. Each platform's installer must be
built on that platform: build the Linux packages on Linux, the Windows
installer on Windows, and the macOS disk image on a Mac.

## Before you begin

On each build machine, install the following:

- Node.js 24 or later, which includes npm 11.
- Git.

Then copy or clone the repository, and in the repository folder, install the
dependencies:

```
npm install
```

The `postinstall` script downloads the Electron binary for the machine's
platform. npm runs install scripts only for packages that the `allowScripts`
section of the `package.json` file approves.

To confirm the setup, run the unit tests:

```
npm test
```

## Linux

To build an AppImage and a Debian package, run the following command:

```
npm run dist:linux
```

The `dist/` folder then holds the `Markpad-VERSION.AppImage` file and the
`markpad_VERSION_amd64.deb` file, where `VERSION` is the version in the
`package.json` file.

- To run the AppImage, make it executable with `chmod +x`, and then run it.
- To install the Debian package, run `sudo apt install ./markpad_VERSION_amd64.deb`.

## Windows

To build the installer, run the following command in PowerShell or Command
Prompt:

```
npm run dist:win
```

The `dist/` folder then holds the `Markpad-Setup-VERSION.exe` installer.

The installer isn't code-signed, so Microsoft Defender SmartScreen warns on
first launch. To run it anyway, click **More info**, and then click **Run
anyway**.

## macOS

To build a disk image for the Mac's own processor type, run the following
command:

```
npm run dist:mac
```

To build one disk image that runs on both Apple silicon and Intel Macs, run
the following command instead:

```
npm run dist:mac -- --universal
```

The `dist/` folder then holds the `Markpad-VERSION-ARCH.dmg` file, where
`ARCH` is `arm64` for Apple silicon, `x64` for Intel, or `universal` for a
universal build.

The app isn't signed or notarized, so Gatekeeper blocks it on first launch.
To open it anyway, follow these steps:

1. Open the disk image and drag **Markpad** to the **Applications** folder.
2. Open Markpad. macOS says that it can't verify the app.
3. Click **System Settings > Privacy & Security**.
4. In the **Security** section, click **Open Anyway** next to the Markpad
   message.

Signing and notarization need a paid Apple Developer account. With one, set
the `identity` key in the `electron-builder.yml` file to your signing
identity, and see the electron-builder documentation about notarization.

## Build releases automatically

A release agent on a Mac or a Windows PC watches the GitHub repository for
a release and attaches that machine's installer to it. Every five minutes,
the agent checks the latest release. If the release doesn't have the
machine's installer yet, the agent does the following:

1. Clones or updates its own copy of the repository, and checks out the
   release tag.
1. Runs `npm ci` and the unit tests.
1. Builds the installer.
1. Uploads the installer to the release.

If the tests or the build fail, the agent uploads nothing and logs the
error. It doesn't retry that release until the tag points to a different
commit.

The release tag must match the version in the `package.json` file: the
`v1.2.0` tag, for example, needs version `1.2.0`.

### Before you begin

On the build machine, install the following:

- Git.
- Node.js 24 or later.
- The [GitHub CLI](https://cli.github.com).

Then sign in to GitHub with an account that can edit the repository's
releases:

```
gh auth login
```

The agent runs while you're signed in to the computer, and it skips checks
while the computer sleeps.

### Install the agent on a Mac

In a clone of the repository, run the following command:

```
scripts/release-agent/install-macos.sh --repo GITHUB_USER/Markpad
```

Replace `GITHUB_USER` with the GitHub account that owns the repository.

The installer copies the agent to the
`~/Library/Application Support/MarkpadReleaseAgent` folder and registers a
launch agent that runs it every five minutes. The agent logs its builds to
the `~/Library/Logs/MarkpadReleaseAgent.log` file and shows a notification
after each upload or failure. It builds a disk image for the Mac's own
processor type.

To remove the agent, run `scripts/release-agent/install-macos.sh --uninstall`.

### Install the agent on Windows

In PowerShell, in a clone of the repository, run the following command:

```
powershell -ExecutionPolicy Bypass -File scripts\release-agent\Install-MarkpadReleaseAgent.ps1 -Repo GITHUB_USER/Markpad
```

Replace `GITHUB_USER` with the GitHub account that owns the repository.

The installer copies the agent to the `%LOCALAPPDATA%\MarkpadReleaseAgent`
folder and registers the **Markpad release agent** scheduled task. The task
starts when you sign in to Windows and checks every five minutes until you
sign out. The agent logs its builds to the `agent.log` file in the same
folder.

To remove the agent, run the installer with `-Uninstall` in place of
`-Repo GITHUB_USER/Markpad`.

### Publish a release

To publish a release that the agents complete, follow these steps:

1. Update the version in the `package.json` file, commit, and push.
1. Tag the commit with the version, such as `v1.2.0`, and push the tag.
1. On a Linux machine, build the Linux packages with `npm run dist:linux`.
1. Create the release and attach the Linux packages:

   ```
   gh release create v1.2.0 dist/Markpad-1.2.0.AppImage dist/markpad_1.2.0_amd64.deb --title "Markpad 1.2.0" --notes-file NOTES.md
   ```

   Replace `NOTES.md` with a file that holds the release notes.

Within about five minutes, each agent starts its build, and the Windows and
macOS installers appear on the release when their builds finish.

To build a release again on one machine, run the agent by hand with
`--force` (macOS) or `-Force` (Windows). On macOS, run
`~/Library/Application\ Support/MarkpadReleaseAgent/markpad-release-agent.sh --repo GITHUB_USER/Markpad --force`.
On Windows, run
`powershell -ExecutionPolicy Bypass -File %LOCALAPPDATA%\MarkpadReleaseAgent\MarkpadReleaseAgent.ps1 -Repo GITHUB_USER/Markpad -Force`.

## The mpd command

The `resources/bin/mpd` file (POSIX shell) and the `resources/bin/mpd.cmd`
file (Windows) ship in each package's `resources/bin` folder. The Debian
package links `/usr/bin/mpd` to the shell script in its install script,
`resources/linux/after-install.sh`, and removes the link in
`resources/linux/after-remove.sh`. Both scripts are copies of the
electron-builder templates with lines added at the end; when you update
electron-builder, compare them with the templates in
`node_modules/app-builder-lib/templates/linux/`.

On other platforms, **Help > Install 'mpd' command** writes a copy of the
script with the app's path filled in.

Music Player Daemon also uses the name `mpd`. The install script and the menu
item don't replace a file that isn't Markpad's script.

## File associations

Each installer registers Markpad as an editor for `.md`, `.markdown`,
`.mdown`, and `.mkd` files. It doesn't make Markpad the default app. To
make it the default, use your operating system's **Open with** setting.

## App icon

The `resources/icon.svg` file is the source of the app icon. The
`scripts/build-icons.sh` script generates the files that the installers
use, and those files are checked in:

- `resources/icons/`: a PNG file for each size, from 16x16 to 1024x1024.
  The Linux packages install them in the hicolor icon theme.
- `resources/icon.ico`: the Windows icon.
- `resources/icon.icns`: the macOS icon.

To change the icon, edit the `resources/icon.svg` file, then regenerate the
icon files on Linux:

```
sudo apt-get install librsvg2-bin icoutils icnsutils
scripts/build-icons.sh
```
