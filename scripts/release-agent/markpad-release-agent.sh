#!/usr/bin/env bash
# Builds Markpad installers for the latest GitHub release and attaches them.
#
# Each run checks the repository's latest release. If the release doesn't
# have this machine's installer yet, the agent checks out the release tag,
# runs the unit tests, builds the installer, and uploads it to the release.
# If the release already has the installer, the run does nothing.
#
# A failed build isn't retried until the tag moves to a different commit,
# unless you pass --force.
#
# The agent runs on macOS, where it builds a DMG file, and on Linux, where it
# builds an AppImage and a Debian package. It needs git, Node.js 24 or later,
# and the GitHub CLI (gh), signed in with `gh auth login`.
#
# Written for the Bash 3.2 that ships with macOS.
set -euo pipefail

readonly USAGE="Usage: markpad-release-agent.sh --repo OWNER/NAME [--force] [--work-dir DIR]
                                [--clone-url URL]

Builds this machine's Markpad installer for the latest release of the GitHub
repository OWNER/NAME and attaches it to the release.

Options:
  --repo OWNER/NAME  The GitHub repository, such as alex/Markpad. Required.
  --force            Build even if the last build of this release failed.
  --work-dir DIR     The folder for the checkout, state, and log.
  --clone-url URL    The URL to clone from. Default: the repository on GitHub.
  -h, --help         Show this help."

repo=''
force=0
clone_url=''
case "$(uname -s)" in
  Darwin)
    platform=mac
    work_dir="$HOME/Library/Application Support/MarkpadReleaseAgent"
    log_file="$HOME/Library/Logs/MarkpadReleaseAgent.log"
    ;;
  Linux)
    platform=linux
    work_dir="${XDG_DATA_HOME:-$HOME/.local/share}/markpad-release-agent"
    log_file=''
    ;;
  *)
    printf 'markpad-release-agent: unsupported system %s\n' "$(uname -s)" >&2
    exit 2
    ;;
esac

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) repo="${2:-}"; shift 2 ;;
    --force) force=1; shift ;;
    --clone-url) clone_url="${2:-}"; shift 2 ;;
    --work-dir) work_dir="${2:-}"; log_file=''; shift 2 ;;
    -h | --help) printf '%s\n' "$USAGE"; exit 0 ;;
    *) printf 'markpad-release-agent: unknown option %s\n\n%s\n' "$1" "$USAGE" >&2; exit 2 ;;
  esac
done

if [[ ! "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  printf 'markpad-release-agent: --repo OWNER/NAME is required\n\n%s\n' "$USAGE" >&2
  exit 2
fi

[[ -n "$clone_url" ]] || clone_url="https://github.com/$repo.git"
readonly clone_url
readonly checkout="$work_dir/repo"
readonly state_file="$work_dir/failed-build"
readonly lock_dir="$work_dir/lock"
[[ -n "$log_file" ]] || log_file="$work_dir/agent.log"
readonly log_file
readonly max_log_bytes=1000000

mkdir -p "$work_dir" "$(dirname "$log_file")"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$log_file"
}

fail() {
  log "ERROR: $*"
  exit 1
}

# Keeps the log under about 1 MB by starting a new file and keeping one old one.
rotate_log() {
  if [[ -f "$log_file" ]] && [[ "$(wc -c <"$log_file")" -gt "$max_log_bytes" ]]; then
    mv -f "$log_file" "$log_file.1"
  fi
}

# Shows a notification on macOS; elsewhere, the log is enough.
notify() {
  if [[ "$platform" == mac ]]; then
    osascript -e "display notification \"$1\" with title \"Markpad release agent\"" \
      >/dev/null 2>&1 || true
  fi
}

# Prints the names of the installer files that this machine builds for a
# version, one per line.
installer_names() {
  local version="$1"
  if [[ "$platform" == mac ]]; then
    local arch
    arch="$(uname -m)"
    [[ "$arch" == x86_64 ]] && arch=x64
    printf 'Markpad-%s-%s.dmg\n' "$version" "$arch"
  else
    printf 'Markpad-%s.AppImage\nmarkpad_%s_amd64.deb\n' "$version" "$version"
  fi
}

# Takes a lock so that a slow build and the next scheduled run don't overlap.
# A lock older than three hours is left over from a crash, so it's removed.
take_lock() {
  if mkdir "$lock_dir" 2>/dev/null; then
    return 0
  fi
  if [[ -n "$(find "$lock_dir" -maxdepth 0 -mmin +180 2>/dev/null)" ]]; then
    log "Removing a stale lock from an earlier run."
    rmdir "$lock_dir" 2>/dev/null || true
    mkdir "$lock_dir" 2>/dev/null && return 0
  fi
  return 1
}

check_tools() {
  local tool
  for tool in git node npm gh; do
    command -v "$tool" >/dev/null 2>&1 || fail "$tool isn't on the PATH ($PATH)."
  done
  gh auth status >/dev/null 2>&1 || fail "The GitHub CLI isn't signed in. Run 'gh auth login'."
}

# Checks out a tag into a clean copy of the repository.
#
# The caller runs this function in an if condition, where Bash ignores
# set -e, so each step checks its own status.
checkout_tag() {
  local tag="$1"
  if [[ ! -d "$checkout/.git" ]]; then
    rm -rf "$checkout"
    git clone --quiet "$clone_url" "$checkout" || return 1
  fi
  git -C "$checkout" fetch --quiet --force --tags origin &&
    git -C "$checkout" checkout --quiet --force --detach "refs/tags/$tag" &&
    git -C "$checkout" clean --quiet -fdx
}

# Runs the unit tests and builds the installers in the checkout, with the
# command output going to the log. Like checkout_tag, it checks each step.
build() {
  local version="$1" package_version
  package_version="$(cd "$checkout" && node -p "require('./package.json').version")" ||
    return 1
  if [[ "$package_version" != "$version" ]]; then
    log "The tag says version $version, but package.json says $package_version."
    return 1
  fi
  (
    cd "$checkout" &&
      npm ci --no-audit --no-fund &&
      npm test &&
      npm run "dist:$platform"
  ) >>"$log_file" 2>&1
}

main() {
  rotate_log
  if ! take_lock; then
    exit 0
  fi
  trap 'rmdir "$lock_dir" 2>/dev/null || true' EXIT
  check_tools

  local tag
  if ! tag="$(gh release view --repo "$repo" --json tagName --jq .tagName 2>/dev/null)"; then
    exit 0 # The repository has no release yet, or GitHub is unreachable.
  fi
  local version="${tag#v}"

  local assets missing=() name
  assets="$(gh release view "$tag" --repo "$repo" --json assets --jq '.assets[].name')"
  while IFS= read -r name; do
    if ! printf '%s\n' "$assets" | grep -qxF "$name"; then
      missing+=("$name")
    fi
  done < <(installer_names "$version")
  if [[ ${#missing[@]} -eq 0 ]]; then
    exit 0 # This release already has this machine's installers.
  fi

  local commit
  commit="$(git ls-remote "$clone_url" "refs/tags/$tag^{}" "refs/tags/$tag" |
    head -n 1 | cut -f 1)"
  if [[ "$force" -eq 0 && -f "$state_file" && "$(cat "$state_file")" == "$tag $commit" ]]; then
    exit 0 # This commit already failed to build; wait for a new tag or --force.
  fi

  log "Building ${missing[*]} for $tag ($commit)."
  if ! checkout_tag "$tag" || ! build "$version"; then
    printf '%s %s\n' "$tag" "$commit" >"$state_file"
    notify "The $tag build failed. See $log_file."
    fail "The build for $tag failed. See the build output earlier in $log_file."
  fi

  local files=()
  for name in "${missing[@]}"; do
    [[ -f "$checkout/dist/$name" ]] || fail "The build didn't produce dist/$name."
    files+=("$checkout/dist/$name")
  done
  gh release upload "$tag" "${files[@]}" --repo "$repo" --clobber >>"$log_file" 2>&1 ||
    fail "Uploading the installers to $tag failed."
  rm -f "$state_file"
  log "Uploaded ${missing[*]} to $tag."
  notify "Uploaded ${missing[*]} to $tag."
}

main
