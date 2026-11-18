---
# Copy this file to data/places/<place-id>.md (a subfolder is fine, e.g. data/places/colorado/<place-id>.md)
# The file name (without .md) is the place id, e.g. data/places/sisson-ca.md -> sisson-ca

# Today's name, e.g. Mount Shasta
name: Salida

# Optional: the id of the place this one is inside, e.g. san-francisco-ca
# A sub-place can leave lat/lon empty to use its parent's point
parent:

# State or province. More than one: [Montana, North Dakota]
region: [Colorado]

# Decimal degrees, from USGS GNIS where possible (see README). West is negative.
lat: 38.5347193
lon: -105.9989022

# e.g. "USGS GNIS 1659136", or "OpenStreetMap" / "1885 map" if not in GNIS
coords_source: USGS GNIS 204758

# exact | approximate | unknown
precision: exact

# town | depot | natural-feature | building | resort | mine | route | other
category: town

# extant | thriving | transformed | renamed | absorbed | declined | ghost-town | gone | unknown
status: extant

# One line for the popup, e.g. "Renamed Mount Shasta in 1922."
status_summary:

# Optional: yes, or when you went: 2018, 2018-07 or 2018-07-10
visited: yes

# e.g. [Sisson, Strawberry Valley]
former_names: []

# Optional related books or articles, one per line, in quotes, e.g.
#   - "Smith, Jane. *A Lake History*. University Press, 1990."
#   - "[Article title](https://example.org)"
read_more: []

# Themes, e.g. [water, rail, sprawl, labor]
tags: []

# Your own photos, in site/images/, e.g. [{file: tahoe-2018.jpg, caption: "South shore, July 2018"}]
photos: []
---
