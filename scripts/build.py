#!/usr/bin/env python3
"""Check the data files and build the site.

    python scripts/build.py           # check + build into dist/
    python scripts/build.py --check   # check only, write nothing

Reads:
    data/guides.yml
    data/places/<place-id>.md
    data/entries/<guide-id>/<place-id>.md
Writes:
    dist/                 a copy of site/ plus...
    dist/data.json        every guide, place and entry, ready for the map

Every problem is reported in plain words with the file it is in. If any
problem is found, the script stops with an error so nothing broken goes live.
"""

import datetime
import json
import re
import shutil
import sys
from pathlib import Path

import markdown
import yaml

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SITE = ROOT / "site"
DIST = ROOT / "dist"

# The fixed lists. Add a value here if you need a new one; the map colors
# statuses in site/app.js (STATUS_COLORS).
CATEGORIES = {"town", "depot", "natural-feature", "building", "resort", "mine", "route", "other"}
STATUSES = {"thriving", "transformed", "renamed", "absorbed", "declined", "ghost-town", "gone", "unknown"}
PRECISIONS = {"exact", "approximate", "unknown"}

ID_PATTERN = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
FRONTMATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", re.DOTALL)

problems = []


def problem(path, message):
    problems.append(f"{path.relative_to(ROOT)}: {message}")


def read_markdown_file(path):
    """Return (fields, body) from a file with --- fields --- at the top."""
    text = path.read_text(encoding="utf-8")
    match = FRONTMATTER.match(text)
    if not match:
        problem(path, "the file must start with a line '---', then the fields, then another '---'.")
        return None, ""
    try:
        fields = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError as err:
        mark = getattr(err, "problem_mark", None)
        where = f" (around line {mark.line + 2})" if mark else ""
        problem(path, f"the fields at the top could not be read{where}. "
                      "Check for a missing space after a colon, or a value containing ': ' that needs quotes.")
        return None, ""
    if not isinstance(fields, dict):
        problem(path, "the fields at the top should be lines like 'name: Seattle'.")
        return None, ""
    return fields, match.group(2).strip()


def to_html(body):
    return markdown.markdown(body) if body else ""


def plain(value):
    """YAML turns dates and numbers into objects; the site wants text."""
    if value is None:
        return ""
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    return str(value).strip()


def load_guides():
    path = DATA / "guides.yml"
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    except yaml.YAMLError:
        problem(path, "could not be read. Check indentation: each guide starts with '- id:'.")
        return {}
    guides = {}
    for i, g in enumerate(raw, start=1):
        if not isinstance(g, dict):
            problem(path, f"guide #{i} is not in the expected format.")
            continue
        gid = plain(g.get("id"))
        label = gid or f"guide #{i}"
        if not ID_PATTERN.match(gid):
            problem(path, f"{label}: id must be lowercase letters, numbers and dashes, e.g. wood-1904.")
            continue
        if gid in guides:
            problem(path, f"{gid}: this id is used twice.")
        for field in ("title", "author", "year"):
            if not plain(g.get(field)):
                problem(path, f"{gid}: '{field}' is missing.")
        guides[gid] = {
            "id": gid,
            "title": plain(g.get("title")),
            "short_title": plain(g.get("short_title")) or plain(g.get("title")),
            "author": plain(g.get("author")),
            "year": plain(g.get("year")),
            "first_published": plain(g.get("first_published")),
            "publisher": plain(g.get("publisher")),
            "scan_url": plain(g.get("scan_url")),
            "notes": plain(g.get("notes")),
        }
    return guides


def as_list(value):
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return [plain(v) for v in value if plain(v)]
    return [plain(value)]


def load_places():
    places = {}
    for path in sorted((DATA / "places").glob("*.md")):
        pid = path.stem
        if not ID_PATTERN.match(pid):
            problem(path, "file name must be lowercase letters, numbers and dashes, e.g. seattle-wa.md.")
            continue
        fields, body = read_markdown_file(path)
        if fields is None:
            continue
        name = plain(fields.get("name"))
        if not name:
            problem(path, "'name' is missing.")
        lat, lon = fields.get("lat"), fields.get("lon")
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            problem(path, "'lat' and 'lon' must both be numbers, e.g. lat: 47.6062 and lon: -122.3321.")
            lat = lon = None
        elif not (-90 <= lat <= 90 and -180 <= lon <= 180):
            problem(path, "'lat' must be between -90 and 90 and 'lon' between -180 and 180. Are they swapped?")
            lat = lon = None
        precision = plain(fields.get("precision")) or "exact"
        if precision not in PRECISIONS:
            problem(path, f"precision '{precision}' should be one of: {', '.join(sorted(PRECISIONS))}.")
        category = plain(fields.get("category")) or "other"
        if category not in CATEGORIES:
            problem(path, f"category '{category}' should be one of: {', '.join(sorted(CATEGORIES))}.")
        status = plain(fields.get("status")) or "unknown"
        if status not in STATUSES:
            problem(path, f"status '{status}' should be one of: {', '.join(sorted(STATUSES))}.")
        places[pid] = {
            "id": pid,
            "name": name,
            "region": plain(fields.get("region")),
            "lat": lat,
            "lon": lon,
            "precision": precision,
            "category": category,
            "status": status,
            "status_summary": plain(fields.get("status_summary")),
            "former_names": as_list(fields.get("former_names")),
            "visited": plain(fields.get("visited")),
            "tags": [t.lower() for t in as_list(fields.get("tags"))],
            "notes_html": to_html(body),
            "entries": [],
        }
    return places


def load_entries(guides, places):
    count = 0
    for path in sorted((DATA / "entries").glob("**/*.md")):
        fields, body = read_markdown_file(path)
        if fields is None:
            continue
        gid = plain(fields.get("guide")) or path.parent.name
        pid = plain(fields.get("place")) or path.stem
        if gid not in guides:
            problem(path, f"guide '{gid}' is not in data/guides.yml.")
            continue
        if path.parent.name != gid:
            problem(path, f"this file says guide '{gid}' but sits in the folder '{path.parent.name}'.")
        if pid not in places:
            problem(path, f"place '{pid}' has no file. Create data/places/{pid}.md (copy templates/place.md).")
            continue
        if not plain(fields.get("page")):
            problem(path, "'page' is missing.")
        if not body:
            problem(path, "the quote is missing. Paste the guide's words below the second '---'.")
        places[pid]["entries"].append({
            "guide": gid,
            "name_in_guide": plain(fields.get("name_in_guide")) or places[pid]["name"],
            "page": plain(fields.get("page")),
            "section": plain(fields.get("section")),
            "summary": plain(fields.get("summary")),
            "quote_html": to_html(body),
        })
        count += 1
    return count


def main():
    check_only = "--check" in sys.argv
    guides = load_guides()
    places = load_places()
    n_entries = load_entries(guides, places)

    for place in places.values():
        place["entries"].sort(key=lambda e: (guides[e["guide"]]["year"], e["guide"]))

    if problems:
        print(f"Found {len(problems)} problem(s):\n")
        for p in problems:
            print("  - " + p)
        print("\nNothing was published. Fix the above and save again.")
        sys.exit(1)

    unused = [p["id"] for p in places.values() if not p["entries"]]
    print(f"All good: {len(guides)} guides, {len(places)} places, {n_entries} entries.")
    if unused:
        print(f"Note: {len(unused)} place(s) have no guide entries yet and are shown greyed out: {', '.join(unused)}")

    if check_only:
        return

    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(SITE, DIST)
    out = {
        "built": datetime.date.today().isoformat(),
        "guides": list(guides.values()),
        "places": list(places.values()),
    }
    (DIST / "data.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Built the site into {DIST.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
