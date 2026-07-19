# 027 — Experiment with dark/yellow ClickHouse-style theme

## Request
Try a theme experiment: dark background with yellow accents, in the style of ClickHouse branding.

## Status
**Status:** done

Resolution: opt-in "ch" theme — near-black surfaces (#0c0c09) with ClickHouse
yellow (#ffcc00) accents — behind a palette toggle in the header. Dark mode now
keys off `data-mode` on <html> (set before paint by an inline script from
localStorage `th-theme`, falling back to the system preference; Tailwind's dark
variant redefined via @custom-variant), so the theme can force dark regardless of
the OS. The theme itself is one CSS block: it re-points --background/--viz-*
(series 1 becomes yellow, the amber slot swaps to blue to avoid colliding) and
remaps the --color-blue-* scale to a yellow ramp, which re-accents every
blue-utility component without touching markup; solid yellow fills get dark text
for contrast. Verified by web/scripts/verify-027-ui.mjs (10 assertions: system
dark regression, toggle on/off, forced dark, exact bg + Ask-button colors,
persistence across reload) plus eyeballed screenshots of home and dashboard.
