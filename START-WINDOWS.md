# ReactorPlan — Windows startup

## One-command development startup

From the project root:

```powershell
npm install --prefix backend
npm install --prefix frontend
npm run validate
npm run preflight
npm run smoke
npm run dev
```

This starts both services:

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000

Open **http://localhost:5173** for the ReactorPlan application.

Opening **http://localhost:4000** is also safe: it shows an API status page with a link to the frontend instead of `Cannot GET /`.

## Separate terminals

Backend:

```powershell
cd backend
npm install
npm run dev
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

## Optional local open-source planning assistant

For AI-generated explanations in the Availability & Equipment Mapping page, follow `START-OPEN-SOURCE-LLM-WINDOWS.md` to install Ollama and download `qwen2.5:3b`. The app remains usable without the model and labels its rule-based fallback clearly.
