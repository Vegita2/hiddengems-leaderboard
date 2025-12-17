# Hidden Gems Leaderboard (viewer)

Static webpage for browsing `data.json` by date and viewing each day’s leaderboard in a searchable/sortable table.

## Run locally

From this folder:

```bash
python -m http.server
```

Then open `http://localhost:8000/` in your browser.

## Notes

- `index.html` loads `data.json` via `fetch()`, so it won’t work from `file://`.
- UI uses Bootstrap + DataTables via CDN.
- `matrix.html` shows a rank-by-day matrix with a start/end date filter.
