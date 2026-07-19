# 043 — Multiple named dashboards

## Task

Today there is a single live dashboard of saved widgets (task 019). Support multiple dashboards, each with a name:

- Saving a widget defaults to a **new dashboard per session**: the first save in a chat session creates a fresh dashboard (auto-named, e.g. from the session topic or date), and later saves in the same session land there.
- The save flow lets you pick a different existing dashboard instead of the session default.
- Dashboard page gets a switcher/list: view, rename, delete dashboards.
- The summarize digest (task 039) saves into the same structure.

## Notes

- Data model: dashboards table (id, name, user, created_at) + widget→dashboard reference; migrate existing saved widgets into a "Default" dashboard.
- Per-user once task 026 (user system) lands; align with it.
- Auto-name suggestion: ticker or category of the session ("GOOGL deep dive · Jul 19").

## Status
**Status:** done

Resolution: dashboards table (id/user/name/created_at) + dashboard_id FK on
dashboard_widgets (ON DELETE CASCADE), with an idempotent migration in ensureSchema
that moves pre-existing widgets into a per-user "Default" dashboard. Data layer
gains list/create/rename/delete + dashboard-scoped save/list; saving into another
user's dashboard is a no-op (ownership subquery — covered in the 026 regression
suite, updated). The "☆ save" button now opens a picker: first entry creates (or
reuses) the session dashboard, auto-named from the first question + date ("Show me
the Tech category · Jul 19"); existing dashboards listed below; Escape/outside
click closes. Later saves in the session default to the session dashboard; the
summarize digest saves through the same path. /dashboard gets linkable ?d= tabs
with widget counts, inline rename (✎) and delete (✕, confirm, cascades widgets).
Verified: DB suite (7 dashboard assertions incl. cross-user) and Playwright E2E
(picker → auto-named dashboard → second save defaults there → tab shows (2) →
rename sticks → delete cascades) — web/scripts/verify-043-ui.mjs.
