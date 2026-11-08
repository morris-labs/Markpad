# Contribute to Markpad

Markpad is an Electron app written in TypeScript. The editor is built on
[Milkdown](https://milkdown.dev), which is built on ProseMirror.

## Set up a development environment

Install Node.js 24 or later, then clone the repository and install the
dependencies:

```
git clone https://github.com/morris-labs/Markpad.git
cd Markpad
npm install
```

To run the app with hot reload, run `npm run dev`.

## Commands

The following table lists the project's commands:

| Task                                   | Command                  |
|----------------------------------------|--------------------------|
| Run the app with hot reload            | `npm run dev`            |
| Build into the `out/` folder           | `npm run build`          |
| Type-check                             | `npm run typecheck`      |
| Lint                                   | `npm run lint`           |
| Format                                 | `npm run format`         |
| Run unit tests                         | `npm test`               |
| Run end-to-end tests                   | `npm run e2e`            |
| Preview the editor in a web browser    | `npm run preview:web`    |
| Build Linux packages                   | `npm run dist:linux`     |
| Regenerate the app icons               | `scripts/build-icons.sh` |

The end-to-end tests launch the app with Playwright, so they need a
display. On a Linux machine without one, run them under Xvfb:
`xvfb-run -a npm run e2e`.

The browser preview runs the editor on port 20390 with an in-memory
stand-in for the file system, so it doesn't read or write files.

## Code layout

- `src/main/`: the Electron main process, which handles windows, menus,
  files, and dialogs.
- `src/preload/`: the preload script, which exposes the `window.markpad`
  API to the editor. It builds as CommonJS because the renderer is
  sandboxed.
- `src/shared/`: types that the main process and the renderer share.
- `src/renderer/`: the user interface, in plain TypeScript and CSS.
- `tests/unit/`: Vitest unit tests.
- `tests/e2e/`: Playwright end-to-end tests.

## Conventions

- Keep `contextIsolation` and `sandbox` on. The renderer reaches the file
  system only through the `MarkpadApi` interface in the
  `src/shared/api.ts` file.
- All npm packages are `devDependencies`. Vite bundles the renderer, and
  the main process uses only Electron and Node.js, so the packaged app
  carries no `node_modules` folder.
- Before you send a pull request, run `npm run typecheck`, `npm run lint`,
  `npm test`, and `npm run e2e`.
