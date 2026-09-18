# Titan In-Field Servicing - New Laptop Transfer

This package contains the Titan Safety Systems In-Field Servicing V1 app source code.

## What is included

- `src/` app source code
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tsconfig.json`
- `vite.config.ts`
- `index.html`
- `.gitignore`

The package does not include:

- `node_modules/`
- `dist/`

Those folders are generated again on the new laptop.

## GitHub backup

Repository:

https://github.com/stuartfishwick91/titan-in-field-servicing

## Install on the new laptop

1. Install Node.js LTS from:

   https://nodejs.org/

2. Open PowerShell in the transferred app folder.

3. Enable pnpm:

   ```powershell
   corepack enable
   corepack prepare pnpm@latest --activate
   ```

4. Install dependencies:

   ```powershell
   pnpm install
   ```

5. Start the app:

   ```powershell
   pnpm run dev
   ```

6. Open:

   ```text
   http://127.0.0.1:5173/employee
   http://127.0.0.1:5173/management/dashboard
   ```

## If port 5173 is busy

Run:

```powershell
pnpm run dev -- --port 5174
```

Then open:

```text
http://127.0.0.1:5174/employee
```

## Important prototype note

The current app stores trial data in browser local storage. That means data entered on one laptop/browser does not automatically appear on another device until a shared database is added.

For real multi-device testing, the next step is deploying the app and connecting it to a shared backend such as Supabase.
