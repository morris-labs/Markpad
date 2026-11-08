# Changelog

## Unreleased

- Multiple cursors, as in Sublime Text, in the styled, source, and code
  views. Typing, deleting, moving, copying, pasting, and formatting act at
  every cursor, and one undo reverts the change.
- Unsaved edits survive a restart. When a save fails, closing the window
  keeps the edits in a backup and restores them on the next launch.
  Closing a tab whose save failed asks whether to save it elsewhere.

## 2.0.0 (2026-11-08)

The first public release.

- Styled Markdown editing: typed Markdown syntax turns into formatting as
  you type, and a toolbar applies the same formatting.
- Tabs, autosave, drafts for untitled documents, and session restore.
- Saves only what you edit: unedited parts of a file keep their exact text.
- GitHub Flavored Markdown: tables, task lists, and strikethrough.
- Syntax highlighting in code blocks, with a language picker.
- Local images; pasted and dropped images are copied into an `assets`
  folder.
- Markdown source view, find and replace, an outline panel, and spell
  check.
- Right-click a tab to close it, other tabs, tabs to its left or right,
  unchanged tabs, or all tabs.
- Open path (Ctrl+L) opens a file from a pasted path.
- Text and code files, such as `.txt`, `.java`, `.json`, and `.xml` files,
  open as text with syntax highlighting instead of as Markdown.
- If a file can't be saved, closing its tab asks before discarding the
  edits.
- Print, export to PDF or HTML, and Copy as HTML for pasting into email.
- An editable front matter panel.
- Light and dark themes that follow the OS, with an override.
- The `mpd` command, which opens files from a terminal.
- Linux AppImage and Debian packages.
