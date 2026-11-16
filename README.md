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
  site.yml                         tagline, scrolling marquee, contact email, visitor counter
  guides.yml                       one block per guide edition (wood-1889, ingersoll-1885, ...)
  places/lake-tahoe-ca.md          one file per real place: coordinates, today's status, your notes
  entries/wood-1889/lake-tahoe-ca.md  one file per "this guide talks about this place": page + quote
  illustrations/karst.yml          one file per illustration collection
content/
  about.md                         the About page
  learn-more.md                    the Learn more page (bibliography)
site/
  images/                          engravings, your photos, GIFs
  index.html, app.js, style.css    the site itself
templates/
  place.md                         copy these to start a new file
  entry.md
```

A place can have entries from many guides. Denver, for example, can have
`entries/wood-1889/denver-co.md` and `entries/ingersoll-1885/denver-co.md`;
both show up together on Denver's page.

## Editing the site's words

All the text on the site lives in plain files, so you never need to touch the HTML:

- **Tagline, marquee, contact email:** `data/site.yml`.
- **About and Learn more:** `content/about.md` and `content/learn-more.md`.
  `{{guides}}` on Learn more becomes a list of every guide in `data/guides.yml`.
  Markdown; each `## Heading` becomes a section with its own link
  (`#/about/contact` jumps to the Contact section).
- **A guide's page:** `summary`, `kind`, `covers` and `color` in `data/guides.yml`.
  `color` is that guide's map marker color. Places in more than one guide are grey.
- **An illustration collection's intro:** `intro` in `data/illustrations/<collection>.yml`.
- **Colors and fonts:** the variables at the top of `site/style.css`.

## Adding data

**A new guide:** add a block to `data/guides.yml`. Give it a short id like
`baedeker-1909`, then make a folder `data/entries/baedeker-1909/`.

**A new place:** copy `templates/place.md` to `data/places/<place-id>.md`.
The file name is the place's id. Use lowercase and dashes, and add the
state so ids stay unique: `sisson-ca`, `lucin-ut`, `denver-co`.

- `lat` / `lon`: where possible, use the official point from the USGS
  [Geographic Names Information System (GNIS)](https://edits.nationalmap.gov/apps/gaz-domestic/public/search/names),
  so a big place like "San Francisco" is always the same spot. Search the name, open the
  result, and copy its latitude and longitude in decimal degrees. If the place isn't in
  GNIS, right-click the spot in [OpenStreetMap](https://www.openstreetmap.org) instead and
  set `precision: approximate` if you're unsure. West of Greenwich is negative.
- `parent` (optional): for a place inside another, like Golden Gate Park in
  San Francisco, the id of the place it's in: `parent: san-francisco-ca`. It gets
  its own marker and page, is listed under its parent on the Places page and the
  parent's page, and can have its own entries (the passage about just that spot;
  keep the general intro in the parent's entry). Sub-places can nest. If you
  can't pin one down, leave `lat`/`lon` empty and it uses the parent's point,
  marked approximate.
- `visited` (optional): when you went there yourself, e.g. `2018-07`. Shown as a "Visited" mark on the place.
- `coords_source`: where the coordinates came from, e.g. `USGS GNIS 1659136`
  (the GNIS feature ID) or `OpenStreetMap`. Shown on the place page.
- `precision`: `exact`, `approximate` (shown with a dashed outline), or `unknown`.
- `status`: `thriving`, `transformed`, `renamed`, `absorbed`, `declined`,
  `ghost-town`, `gone`, or `unknown`.
- `category`: `town`, `depot`, `natural-feature`, `building`, `resort`,
  `mine`, `route`, or `other`.
- `photos` (optional): your own photos. Upload them to `site/images/`, then list
  them: `photos: [{file: tahoe-2018.jpg, caption: "South shore, July 2018"}]`.
- `read_more` (optional): related books or articles, shown as "Read more" on the
  place's page. One per line, in quotes, Markdown allowed:
  ```
  read_more:
    - "Smith, Jane. *A Lake History*. University Press, 1990."
    - "[Article title](https://example.org)"
  ```
  Guides take the same `read_more` list in `data/guides.yml`. Leave it out and
  the section doesn't appear.
- Below the second `---`, write whatever you know about the place today.
  Markdown works, including links to sources.

**A new entry:** copy `templates/entry.md` to
`data/entries/<guide-id>/<place-id>.md`, fill in `page` and the other lines,
and paste the guide's words below the second `---`.

**Illustrations:** upload the image to `site/images/`, then add an item to the
collection's file in `data/illustrations/` (see the example in `karst.yml`).
Give it a `place:` and it also shows on that place's page and in its map popup.
A new collection is a new `.yml` file in the same folder.

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
data/entries/wood-1889/sisson-ca.md: place 'sisson-ca' has no file. Create data/places/sisson-ca.md (copy templates/place.md).
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

- `site/` holds the page itself: `index.html`, `style.css`, `app.js`. It is
  one page; the part after `#` picks what to show (`#/place/lake-tahoe-ca`,
  `#/guide/wood-1889`, `#/compare`, `#/about`). The map is
  [Leaflet](https://leafletjs.com) on OpenStreetMap tiles; no accounts or keys.
- `scripts/build.py` reads `data/`, checks everything, and writes
  `dist/data.json` next to a copy of `site/`.
- `.github/workflows/site.yml` runs the build and publishes `dist/` to
  GitHub Pages.

To add a status or category, add it to the lists at the top of
`scripts/build.py`, and give a status a label in `site/app.js` (`STATUS_LABELS`).
Kinds of book need no setup: write any `kind:` in `data/guides.yml` and the site groups by it.

## Finding more guides

US works published in 1930 or earlier are in the public domain. Good places to
look: [Internet Archive](https://archive.org), [HathiTrust](https://www.hathitrust.org),
and the [Library of Congress](https://www.loc.gov). Record the scan's link in
`scan_url` in `guides.yml` so visitors can read the original; the guide's
title then links to it on every entry.
