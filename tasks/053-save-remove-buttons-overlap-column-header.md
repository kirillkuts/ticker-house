# 053 — Save/remove buttons overlap the comparison table's column header

**Status:** done

## Bug

On a head-to-head comparison widget (e.g. "Compare CSCO and NVDA"), the widget's "☆ save" and "remove" buttons in the top-right corner sit on top of the last company's column header — "Nvidia Corp" is half-hidden behind them (screenshot).

## Expected

The buttons don't cover content. Either reserve space for them (padding-right on the widget header/table so the last column clears the buttons), or move them onto their own row / show on hover above the content with a background.

## Notes

- Check other wide widgets too: any view whose content reaches the top-right corner (tables with many columns, full-width charts) will hit the same overlap.
