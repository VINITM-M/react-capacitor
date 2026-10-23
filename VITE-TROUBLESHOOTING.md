# Vite / npm troubleshooting

## Install dependencies
Run these commands from the extracted `ReactorPlan` folder:

```bash
npm run install:all
npm run dev
```

The project uses lockfiles for both `frontend` and `backend`; do not delete them as a first troubleshooting step. `npm ci` requires access to the npm registry (or a complete local npm cache). If installation reports `ENOTCACHED`, the command was run in offline/cache-only mode and one or more packages are not cached. Retry with an internet connection:

```bash
npm --prefix frontend ci
npm --prefix backend ci
```

If the network is unavailable, installation cannot complete until the required packages are available. A missing `vite` executable after an interrupted install means dependencies have not finished installing; it is not by itself evidence of a broken Vite configuration.

## Run the app
Use a supported current Node.js LTS release. `npm run dev` starts the project launcher, which runs the backend and frontend. For frontend-only work, use `npm --prefix frontend run dev`.

## Verify
```bash
npm --prefix frontend run build
npm --prefix backend run validate
npm --prefix backend run preflight
npm --prefix backend run smoke
```
