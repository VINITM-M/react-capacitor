REACTORPLAN — START HERE (Windows / VS Code)

1. Extract this ZIP completely. Open the extracted folder that contains:
   package.json, start-dev.mjs, backend, and frontend.
   Do NOT open a nested folder with the same project name.

2. In VS Code, choose File > Open Folder and select that project folder.

3. Open Terminal > New Terminal. Confirm the terminal is in the project root:
   Get-ChildItem
   You should see package.json, start-dev.mjs, backend, and frontend.

4. Install dependencies (first run only):
   npm run install:all

5. Start the backend and frontend together:
   npm run dev

6. Open the Vite URL shown in the terminal (normally http://127.0.0.1:5173).
   The API runs on http://127.0.0.1:4000.

Troubleshooting:
- If npm is not recognized, install Node.js LTS, restart VS Code, and retry.
- If port 4000 or 5173 is already in use, stop the other process and retry.
- If dependencies seem corrupted, run:
    Remove-Item -Recurse -Force .\frontend\node_modules -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force .\backend\node_modules -ErrorAction SilentlyContinue
    npm run install:all
- Do not run `cd .\frontend` before `npm run dev`; run the combined command from the project root.
- The app uses the included backend/database/mock-db.json. Make a backup before replacing it.
