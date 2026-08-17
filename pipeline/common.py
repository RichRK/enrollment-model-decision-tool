"""Shared helpers. The important one is `fail`: this pipeline stops rather than guesses."""

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

USER_AGENT = "enrollment-model-decision-tool/0.1 (open-data POC)"


class SourceError(RuntimeError):
    """A source did not return what the pipeline was promised it would return."""


def fail(message):
    """Stop the build. Never degrade to a default, an average or a zero."""
    raise SourceError(message)


def get_json(url, timeout=180):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        fail("HTTP %s from %s" % (exc.code, url))
    except urllib.error.URLError as exc:
        fail("could not reach %s (%s)" % (url, exc.reason))


def download(url, dest, timeout=1800):
    """Fetch to `dest` unless it already exists. Raw downloads are treated as immutable."""
    dest = Path(dest)
    if dest.exists() and dest.stat().st_size > 0:
        log("cached  %s (%.1f MB)" % (dest.name, dest.stat().st_size / 1e6))
        return dest

    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".partial")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    log("fetching %s" % url)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response, open(tmp, "wb") as handle:
            while True:
                chunk = response.read(1 << 20)
                if not chunk:
                    break
                handle.write(chunk)
    except (urllib.error.HTTPError, urllib.error.URLError) as exc:
        tmp.unlink(missing_ok=True)
        fail("download failed for %s (%s)" % (url, exc))

    if tmp.stat().st_size == 0:
        tmp.unlink()
        fail("download produced an empty file: %s" % url)
    tmp.replace(dest)
    log("wrote   %s (%.1f MB)" % (dest.name, dest.stat().st_size / 1e6))
    return dest


def write_json(path, payload):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=1, sort_keys=True)
    log("wrote   %s (%.0f KB)" % (path.name, path.stat().st_size / 1e3))


def read_json(path):
    path = Path(path)
    if not path.exists():
        fail("%s is missing -- run the fetch step first" % path)
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def log(message):
    print("  " + message, file=sys.stderr, flush=True)


def main(func):
    """Run a step, and turn a SourceError into a loud non-zero exit rather than a traceback."""
    try:
        func()
    except SourceError as exc:
        print("\nFAILED: %s\n" % exc, file=sys.stderr)
        sys.exit(1)
