# Backend conventions

Keep the API in the existing MVC split: `routes/` maps URLs, `controllers/` owns HTTP status and JSON responses, and `models/` owns database queries. Return JSON for unknown routes and failures; never expose internal exception messages. React is the frontend view, so this Worker returns JSON rather than server-rendered HTML.

Do not add tables until the hackathon brief defines the domain. The health model's `SELECT 1` is the initial D1 connectivity check.
