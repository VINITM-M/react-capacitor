# ReactorPlan local open-source planning assistant (Windows)

The planning assistant is connected to the backend through `POST /api/assistant/recommendation`. It uses a locally running Ollama model to explain why the already-selected reactor fits the submitted filters. The backend verifies the reactor against the source inventory first; the model explains verified facts and does not create or change mappings.

## Enable the local model

1. Install Ollama for Windows from https://ollama.com/download/windows.
2. Open PowerShell and run:
   ```powershell
   ollama pull qwen2.5:3b
   ```
3. Keep Ollama running (its local API normally listens on `http://127.0.0.1:11434`).
4. Start ReactorPlan using the normal `START-WINDOWS.md` steps. The backend uses `qwen2.5:3b` by default.
5. Optional overrides before starting the backend:
   ```powershell
   $env:OLLAMA_BASE_URL = "http://127.0.0.1:11434"
   $env:OLLAMA_MODEL = "qwen2.5:3b"
   npm run dev
   ```

## Fallback behavior

If Ollama is not running or the model is not downloaded, the API returns a deterministic, source-grounded explanation instead of breaking the page. The UI identifies this as rule-based fallback rather than claiming the LLM answered. No cloud API key is required; prompts stay on the local machine when Ollama is used.
