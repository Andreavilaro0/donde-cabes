"""Download what is not in the repository and check every SHA-256. Uses the network.

Usage: python3 -I pipeline/fetch_missing.py
The CSV files fetched here hold personal data: do not commit them.
"""

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENDOR = {'gsap.min.js': '3d1bea374ab1b703cc5c4105358eec63c4465efdc573931dc116e34a0a190c1b', 'ScrollTrigger.min.js': 'b5bb360661f478f0ff6ffa11500d8ce5e2b6aaf6f7288237cdca3aac9548035a'}


def main():
    wanted = [(m.parent / f["file"], f["url"], f["sha256"])
              for m in sorted((ROOT / "datos/snapshots").glob("*/MANIFIESTO.json"))
              for f in json.loads(m.read_text(encoding="utf-8"))["files"]]
    wanted += [(ROOT / "demo/vendor" / n, f"https://cdn.jsdelivr.net/npm/gsap@3.15.1/dist/{n}", h) for n, h in VENDOR.items()]
    bad = []
    for path, url, digest in wanted:
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            try:
                with urllib.request.urlopen(url, timeout=300) as response:
                    path.write_bytes(response.read())
            except OSError as error:
                bad.append(f"{path.name}: {error}")
                continue
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            bad.append(f"{path.name}: SHA-256 differs from the manifest (the source may have changed)")
    print("\n".join(bad) or f"{len(wanted)} files present, SHA-256 match")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
