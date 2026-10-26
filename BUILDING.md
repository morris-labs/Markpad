# Build Markpad installers

Markpad builds with `electron-builder`. Each platform's installer must be
built on that platform. The Linux packages build in the development
container; build the Windows and macOS installers on your own machines.

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

The `dist/` folder then holds the `Markpad Setup VERSION.exe` installer.

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

The `dist/` folder then holds the `Markpad-VERSION.dmg` file, or the
`Markpad-VERSION-universal.dmg` file for a universal build.

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

## The mdv command

The `resources/bin/mdv` file (POSIX shell) and the `resources/bin/mdv.cmd`
file (Windows) ship in each package's `resources/bin` folder. The Debian
package links `/usr/bin/mdv` to the shell script in its install script,
`resources/linux/after-install.sh`, and removes the link in
`resources/linux/after-remove.sh`. Both scripts are copies of the
electron-builder templates with lines added at the end; when you update
electron-builder, compare them with the templates in
`node_modules/app-builder-lib/templates/linux/`.

On other platforms, **Help > Install 'mdv' command** writes a copy of the
script with the app's path filled in.

## File associations

Each installer registers Markpad as an editor for `.md`, `.markdown`,
`.mdown`, and `.mkd` files. It doesn't make Markpad the default app. To
make it the default, use your operating system's **Open with** setting.
