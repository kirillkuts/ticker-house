# 054 — Category tile's change badge overflows onto the next tile

**Status:** done

## Bug

In the homepage "Browse by category" row, tiles with long names break the layout:

- "Aerospace & Defense": the name fills the tile and its ▼ -x.x% change badge spills outside the card, rendering on top of the neighboring "Energy" tile's title (strikethrough-looking collision in the screenshot).
- "Consumer & Media" and "Utilities & Telecom": the +% badge sits outside the right edge of the card.

## Expected

Name and change badge always fit inside the tile. Options: truncate long names with ellipsis, let the badge wrap to a second line, or widen/flex the tiles. The badge must never render outside its own card.

## Steps to reproduce

Open the homepage; look at the category tile row (task 031 feature).
