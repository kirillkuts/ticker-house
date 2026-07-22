# 056 — Theme picker in the header is an unlabeled icon

**Status:** done

Fixed in `web/components/ThemeToggle.tsx`. The button now uses the sibling header pattern: `flex items-center gap-1.5`, a `shrink-0` palette icon, and a `<span className="hidden @lg:inline">Theme</span>` label. It reads "Theme" next to Dashboard/Briefing/New chat/Sign out at normal widths and collapses to the icon alone (with its existing `title` tooltip and `aria-pressed`) when the header is tight, exactly like Dashboard/Briefing. Verified at 1440px (labeled) and 390px (icon-only collapse).

## Task

In the header, the theme picker is a bare palette icon between "Chats" and "Sign out" (red arrow). It has no text, so it's not obvious what it does. Every other header button pairs an icon with a label: "Dashboard", "Briefing", "Chats", "Sign out".

## Expected

The theme picker matches the other header buttons: icon plus a label (e.g. "Theme"). It should read as a labeled control, not a mystery icon.

## Notes

- Keep it consistent with the sibling buttons (same icon + text pattern, same pill styling).
- If a full label crowds the header on narrow widths, that's the general header-crowding concern from task 015 — collapse to icon-only only when space is tight, and add a tooltip/aria-label so it's still discoverable.
