#!/usr/bin/env bash
# Installs the Markpad release agent as a macOS launch agent that runs every
# five minutes while you're signed in.
#
# The script copies markpad-release-agent.sh into
# ~/Library/Application Support/MarkpadReleaseAgent/ and registers
# ~/Library/LaunchAgents/com.markpad.release-agent.plist. Run it again after
# you update the agent script, or with --uninstall to remove the agent.
set -euo pipefail

readonly USAGE="Usage: install-macos.sh --repo OWNER/NAME
       install-macos.sh --uninstall

Options:
  --repo OWNER/NAME  The GitHub repository to build releases for, such as
                     alex/Markpad.
  --uninstall        Stop the agent and remove it. Keeps the log.
  -h, --help         Show this help."

readonly label=com.markpad.release-agent
readonly support_dir="$HOME/Library/Application Support/MarkpadReleaseAgent"
readonly plist="$HOME/Library/LaunchAgents/$label.plist"
readonly log_file="$HOME/Library/Logs/MarkpadReleaseAgent.log"
readonly interval_seconds=300

repo=''
uninstall=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) repo="${2:-}"; shift 2 ;;
    --uninstall) uninstall=1; shift ;;
    -h | --help) printf '%s\n' "$USAGE"; exit 0 ;;
    *) printf 'install-macos: unknown option %s\n\n%s\n' "$1" "$USAGE" >&2; exit 2 ;;
  esac
done

[[ "$(uname -s)" == Darwin ]] || { printf 'install-macos: this script is for macOS\n' >&2; exit 2; }

# Stops the agent if it's loaded.
unload() {
  launchctl bootout "gui/$(id -u)" "$plist" >/dev/null 2>&1 || true
}

if [[ "$uninstall" -eq 1 ]]; then
  unload
  rm -f "$plist"
  rm -rf "$support_dir"
  printf 'Removed the Markpad release agent. The log is in %s.\n' "$log_file"
  exit 0
fi

if [[ ! "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  printf 'install-macos: --repo OWNER/NAME is required\n\n%s\n' "$USAGE" >&2
  exit 2
fi

# Launch agents start with a minimal PATH, so record where the tools live now.
path_dirs=''
for tool in git node npm gh; do
  tool_path="$(command -v "$tool" || true)"
  if [[ -z "$tool_path" ]]; then
    printf 'install-macos: %s is not installed or not on your PATH\n' "$tool" >&2
    exit 1
  fi
  dir="$(dirname "$tool_path")"
  case ":$path_dirs:" in
    *":$dir:"*) ;;
    *) path_dirs="${path_dirs:+$path_dirs:}$dir" ;;
  esac
done
if ! gh auth status >/dev/null 2>&1; then
  printf "install-macos: the GitHub CLI isn't signed in. Run 'gh auth login' first.\n" >&2
  exit 1
fi

mkdir -p "$support_dir" "$(dirname "$plist")" "$(dirname "$log_file")"
cp "$(dirname "$0")/markpad-release-agent.sh" "$support_dir/"
chmod +x "$support_dir/markpad-release-agent.sh"

unload
cat >"$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$support_dir/markpad-release-agent.sh</string>
    <string>--repo</string>
    <string>$repo</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$path_dirs:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StartInterval</key>
  <integer>$interval_seconds</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>LowPriorityIO</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/dev/null</string>
  <key>StandardErrorPath</key>
  <string>$log_file</string>
</dict>
</plist>
EOF
plutil -lint "$plist" >/dev/null
launchctl bootstrap "gui/$(id -u)" "$plist"

printf 'Installed the Markpad release agent for %s.\n' "$repo"
printf 'It checks for a new release every 5 minutes. The log is in %s.\n' "$log_file"
