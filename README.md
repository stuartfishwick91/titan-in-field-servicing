# Titan In-Field Servicing

Working source imported from `Titan_InField_Servicing_Transfer_20260918-182343.zip`.

The login uses the original background and final wordmark from `Titan_InField_Servicing_Latest_Handover_2026-09-18.zip`. These assets live in `public/branding/` and load directly from the website; they do not need to be uploaded into each browser. The handover contained artwork and specifications, not replacement app source.

Sign in with a full name and the existing four-digit PIN. The single login routes employees and management to their respective portals. Remember me stores the name only, never the PIN. SSO and email recovery are not connected; their controls explain the available trial access.

## Live trial

- [Employee portal](https://stuartfishwick91.github.io/titan-in-field-servicing/#/employee)
- [Management portal](https://stuartfishwick91.github.io/titan-in-field-servicing/#/management/dashboard)

This is a public prototype. Use test data only: PIN access is implemented in the browser, not a secure backend. Each browser keeps its own records in local storage. Trial data does not sync between devices and clearing browser data removes those records.

## Local development

Use Node.js 24 and pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Open `http://127.0.0.1:5173/employee` or `http://127.0.0.1:5173/management/dashboard`.

## Publishing

Changes pushed to `main` run `.github/workflows/deploy.yml`, which checks TypeScript, builds the app, and publishes to GitHub Pages. GitHub Pages must use **GitHub Actions** as its source.

`pnpm run build` builds with normal browser routing. `pnpm run build:pages` builds for the repository subpath with hash routing so trial links work when opened directly or refreshed. Generated files and dependencies are excluded from Git.
