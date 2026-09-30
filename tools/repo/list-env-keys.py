#!/usr/bin/env python3
"""Print environment variable names from a JSON array, never their values."""

import json
import sys


def main() -> int:
    prefixes = tuple(sys.argv[1:])
    try:
        entries = json.load(sys.stdin)
    except json.JSONDecodeError as error:
        print(f"invalid JSON input: {error}", file=sys.stderr)
        return 2

    if not isinstance(entries, list) or any(not isinstance(item, str) for item in entries):
        print("expected a JSON array of KEY=VALUE strings", file=sys.stderr)
        return 2

    for entry in entries:
        key, separator, _value = entry.partition("=")
        if separator and (not prefixes or key.startswith(prefixes)):
            print(key)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
