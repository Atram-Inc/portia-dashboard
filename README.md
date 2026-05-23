# Portia Dashboard Template

Static HTML/CSS/JS template that renders Portia Portfolio Climate Risk
Assessment (PCRA) dashboards from data passed in the URL.

## Architecture

The dashboard is **stateless**:

- This repo hosts a single static `index.html` + `app.js` on GitHub Pages
  at `https://atram-inc.github.io/portia-dashboard/`.
- The Python tool (in the private `portia-climate-data` repo) computes
  per-FSP data, compresses it (gzip + base64url), and builds a URL with
  the payload as a `?d=` parameter.
- A user clicking the URL loads the template once. The JavaScript in
  `app.js` reads the `?d=` parameter, decompresses, and renders the
  dashboard with that FSP's data.

No backend. No database. Concurrency-safe: each request is a unique URL.

## URL format

```
https://atram-inc.github.io/portia-dashboard/?d=<base64url-encoded-gzipped-json>
```

The payload JSON shape is documented in `app.js` (function `render`).

## Updating

Edit `index.html`, `app.js`, or files in `assets/`, commit, and push.
GitHub Pages redeploys in ~30 seconds.

## License

© Atram Inc.
