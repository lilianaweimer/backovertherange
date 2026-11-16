---
# Copy this file to data/places/<place-id>.md
# The file name (without .md) IS the place id, e.g. data/places/sisson-ca.md -> sisson-ca
name: Great Plains # today's name, e.g. Mount Shasta
parent: # optional: the id of the place this one is inside, e.g. san-francisco-ca
region: [
    Kansas,
    Nebraska,
    North Dakota,
    South Dakota,
    Colorado,
    Montana,
    Wyoming,
    New Mexico,
    Oklahoma,
    Texas,
    Iowa,
    Minnesota,
    Missouri,
    Alberta,
    Saskatchewan,
    Manitoba,
  ] # state / province, e.g. California. More than one: [Montana, North Dakota]
lat: 39.4166685 # e.g. 41.3099   (from USGS GNIS where possible; see README). A sub-place can leave lat/lon empty to use its parent's point
lon: -101.2921054 # e.g. -122.3106 (west is negative)
coords_source: USGS GNIS 469028 # e.g. "USGS GNIS 1659136", or "OpenStreetMap" / "1885 map" if not in GNIS
precision: approximate # exact | approximate | unknown
category: natural-feature # town | depot | natural-feature | building | resort | mine | route | other
status: transformed # thriving | transformed | renamed | absorbed | declined | ghost-town | gone | unknown
status_summary: # one line for the popup, e.g. "Renamed Mount Shasta in 1922."
visited: # optional: when you went yourself, e.g. 2018-07 or 2018-07-10
former_names: [] # e.g. [Sisson, Strawberry Valley]
read_more: [] # optional related books or articles, one per line, e.g.
  #   - "Smith, Jane. *A Lake History*. University Press, 1990."
  #   - "[Article title](https://example.org)"
tags: [] # themes, e.g. [water, rail, sprawl, labor]
photos: [] # your own photos, in site/images/: [{file: tahoe-2018.jpg, caption: "South shore, July 2018"}]
---
