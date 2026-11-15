#!/usr/bin/env python3
"""Check the data files and build the site.

    python scripts/build.py           # check + build into dist/
    python scripts/build.py --check   # check only, write nothing

Reads:
    data/site.yml         site-wide settings: tagline, marquee, contact, visitor counter
    content/*.md          the About and Learn more pages
    data/guides.yml
    data/places/<place-id>.md
    data/entries/<guide-id>/<place-id>.md
    data/illustrations/<collection-id>.yml
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
import subprocess
import sys
from pathlib import Path

import markdown
import yaml

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SITE = ROOT / "site"
DIST = ROOT / "dist"
CONTENT = ROOT / "content"
IMAGES = SITE / "images"

# The fixed lists. Add a value here if you need a new one; the map colors
# labels in site/app.js (STATUS_LABELS).
CATEGORIES = {"town", "depot", "natural-feature", "building", "resort", "mine", "route", "other"}
STATUSES = {"thriving", "transformed", "renamed", "absorbed", "declined", "ghost-town", "gone", "unknown"}
PRECISIONS = {"exact", "approximate", "unknown"}
COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")

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


def page_html(body):
    """Markdown for whole pages: ## headings get ids so the page can link to them."""
    return markdown.markdown(body, extensions=["toc"]) if body else ""


def check_image(path, file_name):
    """Images live in site/images/. Return the path the site uses, or '' if missing."""
    name = plain(file_name)
    if not name:
        return ""
    if not (IMAGES / name).is_file():
        problem(path, f"image '{name}' isn't in site/images/. Upload it there, or check the spelling.")
        return ""
    return "images/" + name


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
        # Any words you like, e.g. "Railroad guide" or "Route 66 guide". Guides with
        # the same kind are grouped together, so spell it the same way each time.
        kind = plain(g.get("kind")) or "Other"
        color = plain(g.get("color"))
        if color and not COLOR_PATTERN.match(color):
            problem(path, f"{gid}: color '{color}' should look like #9C2A1F (a # and six letters or numbers).")
            color = ""
        guides[gid] = {
            "id": gid,
            "title": plain(g.get("title")),
            "short_title": plain(g.get("short_title")) or plain(g.get("title")),
            "author": plain(g.get("author")),
            "year": plain(g.get("year")),
            "first_published": plain(g.get("first_published")),
            "publisher": plain(g.get("publisher")),
            "scan_url": plain(g.get("scan_url")),
            "hathitrust_url": plain(g.get("hathitrust_url")),
            "kind": kind,
            "color": color,
            "covers": plain(g.get("covers")),
            "summary_html": to_html(plain(g.get("summary"))),
            "notes": plain(g.get("notes")),
        }
    return guides


def as_list(value):
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return [plain(v) for v in value if plain(v)]
    return [plain(value)]


def load_photos(path, raw):
    photos = []
    for i, p in enumerate(raw or [], start=1):
        if isinstance(p, str):
            p = {"file": p}
        if not isinstance(p, dict) or not plain(p.get("file")):
            problem(path, f"photo #{i} needs a 'file:' line, e.g. - file: tahoe-2018.jpg")
            continue
        src = check_image(path, p.get("file"))
        if src:
            photos.append({"src": src, "caption": plain(p.get("caption"))})
    return photos


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
            "added": date_added(path),
            "coords_source": plain(fields.get("coords_source")),
            "photos": load_photos(path, fields.get("photos")),
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


SITE_DEFAULTS = {"goatcounter": "", "tagline": "", "marquee": [], "contact_email": ""}


def load_site_settings():
    path = DATA / "site.yml"
    if not path.exists():
        return dict(SITE_DEFAULTS)
    try:
        fields = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError:
        problem(path, "this file isn't valid YAML. Check the quotes around the code.")
        return dict(SITE_DEFAULTS)
    code = plain(fields.get("goatcounter")).strip().lower()
    if code.endswith(".goatcounter.com"):
        code = code[: -len(".goatcounter.com")]
    code = code.replace("https://", "").replace("http://", "")
    if code and not ID_PATTERN.match(code):
        problem(path, f"goatcounter should be just the code, like backovertherange (got '{code}').")
        code = ""
    marquee = fields.get("marquee") or []
    if isinstance(marquee, str):
        marquee = [marquee]
    return {
        "goatcounter": code,
        "tagline": plain(fields.get("tagline")),
        "marquee": [plain(m) for m in marquee if plain(m)],
        "contact_email": plain(fields.get("contact_email")),
    }


def date_added(path):
    """When this file was first committed (YYYY-MM-DD), or '' if git can't tell."""
    try:
        out = subprocess.run(["git", "log", "--diff-filter=A", "--follow", "--format=%cs", "--", str(path)],
                             cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
        return out[-1] if out else ""
    except (OSError, subprocess.CalledProcessError):
        return ""


def last_updated():
    """Date of the latest commit, or today if git isn't available."""
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%cs"], cwd=ROOT,
                             capture_output=True, text=True, check=True).stdout.strip()
        if out:
            return out
    except (OSError, subprocess.CalledProcessError):
        pass
    return datetime.date.today().isoformat()


def load_illustrations(guides, places):
    collections = []
    folder = DATA / "illustrations"
    for path in sorted(folder.glob("*.yml")) if folder.exists() else []:
        cid = path.stem
        if not ID_PATTERN.match(cid):
            problem(path, "file name must be lowercase letters, numbers and dashes, e.g. karst.yml.")
            continue
        try:
            raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as err:
            mark = getattr(err, "problem_mark", None)
            where = f" (around line {mark.line + 1})" if mark else ""
            problem(path, f"could not be read{where}. Check indentation and quotes.")
            continue
        if not plain(raw.get("title")):
            problem(path, "'title' is missing.")
        items = []
        for i, it in enumerate(raw.get("items") or [], start=1):
            if not isinstance(it, dict) or not plain(it.get("title")):
                problem(path, f"item #{i} needs at least a 'title:'.")
                continue
            gid, pid = plain(it.get("guide")), plain(it.get("place"))
            if gid and gid not in guides:
                problem(path, f"item '{plain(it.get('title'))}': guide '{gid}' is not in data/guides.yml.")
                gid = ""
            if pid and pid not in places:
                problem(path, f"item '{plain(it.get('title'))}': place '{pid}' has no file in data/places/.")
                pid = ""
            items.append({
                "title": plain(it.get("title")),
                "src": check_image(path, it.get("file")),
                "guide": gid,
                "page": plain(it.get("page")),
                "place": pid,
                "material": plain(it.get("material")),
                "artist": plain(it.get("artist")),
            })
        collections.append({
            "id": cid,
            "title": plain(raw.get("title")),
            "holding": plain(raw.get("holding")),
            "dates": plain(raw.get("dates")),
            "intro_html": to_html(plain(raw.get("intro"))),
            "cover": check_image(path, raw.get("cover")),
            "items": items,
        })
    return collections


def guide_list_markdown(guides):
    """The list of guides for {{guides}} on the Learn more page, from data/guides.yml."""
    lines = []
    for g in sorted(guides.values(), key=lambda g: (g["author"].split()[-1:], g["year"])):
        parts = g["author"].split()
        name = f"{parts[-1]}, {' '.join(parts[:-1])}" if len(parts) > 1 else g["author"]
        pub = ", ".join(x for x in (g["publisher"], g["year"]) if x)
        lines.append(f"- {name}. [*{g['short_title']}*](#/guide/{g['id']}). {pub}.")
    return "\n".join(lines)


def load_pages(site, guides):
    """The About and Learn more pages.
    {{contact_email}} becomes the address in data/site.yml; {{guides}} becomes a list of every guide."""
    pages = {}
    for name in ("about", "learn-more"):
        path = CONTENT / f"{name}.md"
        if not path.exists():
            problem(path, "this page's text file is missing.")
            continue
        text = path.read_text(encoding="utf-8").strip()
        text = text.replace("{{contact_email}}", site["contact_email"])
        text = text.replace("{{guides}}", guide_list_markdown(guides))
        pages[name] = page_html(text)
    return pages


def main():
    check_only = "--check" in sys.argv
    site = load_site_settings()
    guides = load_guides()
    places = load_places()
    n_entries = load_entries(guides, places)
    collections = load_illustrations(guides, places)
    pages = load_pages(site, guides)

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
        "updated": last_updated(),
        "site": site,
        "guides": list(guides.values()),
        "places": list(places.values()),
        "illustrations": collections,
        "pages": pages,
    }
    (DIST / "data.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Built the site into {DIST.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
