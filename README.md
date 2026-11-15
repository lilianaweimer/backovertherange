# Back Over the Range

A map of what old, public-domain travel guides said about places, set beside
what those places are like now. Live at **backovertherange.com** (once the
domain is connected; see below).

Every entry is typed in by hand. This repository holds the data as small text
files; a script checks them and builds the map, and GitHub publishes it
automatically.

## How the data is organized

```
data/
  guides.yml                       one block per guide edition (wood-1904, ingersoll-1885, ...)
  places/seattle-wa.md             one file per real place: coordinates, today's status, your notes
  entries/wood-1904/seattle-wa.md  one file per "this guide talks about this place": page + quote
templates/
  place.md                         copy these to start a new file
  entry.md
```

A place can have entries from many guides. Denver, for example, can have
`entries/wood-1904/denver-co.md` and `entries/ingersoll-1885/denver-co.md`;
both show up together when you click Denver on the map.

The three example places (Seattle, Los Angeles, Denver) use fragments quoted
in the Keystone. They are marked EXAMPLE. Overwrite or delete them.

## Adding data

**A new guide:** add a block to `data/guides.yml`. Give it a short id like
`baedeker-1909`, then make a folder `data/entries/baedeker-1909/`.

**A new place:** copy `templates/place.md` to `data/places/<place-id>.md`.
The file name is the place's id. Use lowercase and dashes, and add the
state so ids stay unique: `sisson-ca`, `lucin-ut`, `denver-co`.

- `lat` / `lon`: right-click the spot in [OpenStreetMap](https://www.openstreetmap.org)
  or Google Maps and copy the two numbers. West of Greenwich is negative.
- `precision`: `exact`, `approximate` (shown with a dashed outline), or `unknown`.
- `status`: `thriving`, `transformed`, `renamed`, `absorbed`, `declined`,
  `ghost-town`, `gone`, or `unknown`.
- `category`: `town`, `depot`, `natural-feature`, `building`, `resort`,
  `mine`, `route`, or `other`.
- Below the second `---`, write whatever you know about the place today.
  Markdown works, including links to sources.

**A new entry:** copy `templates/entry.md` to
`data/entries/<guide-id>/<place-id>.md`, fill in `page` and the other lines,
and paste the guide's words below the second `---`.

You can do all of this on github.com: open a folder, choose **Add file →
Create new file**, paste, and **Commit changes**. Or work in any text editor
and push.

### Tips for the lines at the top

- Keep a space after each colon: `page: 112`, not `page:112`.
- If a value contains a colon followed by a space, wrap it in quotes:
  `section: "Chapter IV: The Shasta Route"`.
- Page ranges need quotes too: `page: "15-25"`.
- Lists look like `tags: [water, rail]`.

## The automatic check

Every time you save a change, GitHub runs `scripts/build.py`. If something is
off, the run fails (you'll see a red ✗ next to the commit, and GitHub emails
you) and the live site stays as it was. Click the ✗, then **Details**, to read
messages like:

```
data/entries/wood-1904/sisson-ca.md: place 'sisson-ca' has no file. Create data/places/sisson-ca.md (copy templates/place.md).
```

If it passes (green ✓), the site updates in a minute or two.

## Previewing on your own computer (optional)

You need Python 3.

```
pip install -r requirements.txt
python scripts/build.py
python -m http.server -d dist 8000
```

Then open http://localhost:8000. Run `python scripts/build.py --check` to
check without building.

## Publishing: one-time setup

1. In this repository on GitHub: **Settings → Pages → Build and deployment →
   Source: GitHub Actions**. After the next push, the site is live at
   `https://lilianaweimer.github.io/backovertherange/`.
2. Once that works, connect the domain in **Squarespace**: open your
   Squarespace account, **Domains**, click `backovertherange.com`, then
   **DNS** (DNS Settings).
   - If there is a **Squarespace Defaults** group and you don't use a
     Squarespace website on this domain, delete it; its `@` and `www` records
     would clash.
   - Under **Custom records**, add:

     | Type  | Host | Data                    |
     |-------|------|-------------------------|
     | A     | @    | 185.199.108.153         |
     | A     | @    | 185.199.109.153         |
     | A     | @    | 185.199.110.153         |
     | A     | @    | 185.199.111.153         |
     | CNAME | www  | lilianaweimer.github.io |

3. Back on GitHub: **Settings → Pages → Custom domain**, enter
   `backovertherange.com`, and save. When the DNS check passes (minutes to
   48 hours), tick **Enforce HTTPS**.
4. Optional but recommended: verify the domain under your GitHub account's
   **Settings → Pages** so nobody else can use it with GitHub Pages.

See GitHub's guide to
[managing a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

## Visitor counter

The footer shows "You are visitor no. 001234" once a counter code is set, plus a
"Last updated" date that comes from the latest change in this repository.

1. Sign up at [goatcounter.com](https://www.goatcounter.com) (free for personal sites, no cookies) and pick a code, e.g. `backovertherange`.
2. In GoatCounter, open Settings and tick **Allow adding visitor counts on your website**.
3. Put the code in `data/site.yml`: `goatcounter: "backovertherange"`.

Leave it empty and the counter stays hidden.

## How the site is built

- `site/` holds the page itself: `index.html`, `style.css`, `app.js`. The map
  is [Leaflet](https://leafletjs.com) on OpenStreetMap tiles; no accounts or
  keys.
- `scripts/build.py` reads `data/`, checks everything, and writes
  `dist/data.json` next to a copy of `site/`.
- `.github/workflows/site.yml` runs the build and publishes `dist/` to
  GitHub Pages.

To add a status or category, add it to the lists at the top of
`scripts/build.py`, and give a new status a color and label in `site/app.js`.

## Finding more guides

US works published in 1930 or earlier are in the public domain. Good places to
look: [Internet Archive](https://archive.org), [HathiTrust](https://www.hathitrust.org),
and the [Library of Congress](https://www.loc.gov). Record the scan's link in
`scan_url` in `guides.yml` so visitors can read the original; the guide's
title then links to it on every entry.
