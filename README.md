# TOPIK AI Prep

AI-powered TOPIK II exam prep backend: fresh exam generation, LLM-based Writing
auto-grading, and personalized study plans — all AI-facing text (explanations,
feedback, study plans) delivered in Myanmar (မြန်မာဘာသာ).

## Stack

- **Backend**: FastAPI, Python 3.10+, Pydantic v2
- **Vector DB**: ChromaDB (local persistent, at `data/chroma_db/`)
- **LLM**: LangChain `ChatOpenAI` routed through [OpenRouter](https://openrouter.ai) (`anthropic/claude-sonnet-5`)
- **Embeddings**: Korean SentenceTransformers (`jhgan/ko-sroberta-multitask`)
- **Relational DB**: SQLite via SQLAlchemy (user history & progress)

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file in the project root (never committed — already in `.gitignore`):

```
OPENROUTER_API_KEY=sk-or-v1-...
GEMINI_API_KEY=...
```

`OPENROUTER_API_KEY` is required for: the Writing auto-grader, the study-plan
generator, and the PDF ingestion scripts below (they use vision-LLM calls, not
OCR). `GEMINI_API_KEY` is required for Reading/Listening explanation
generation (`app/services/analytics.py::_generate_mc_explanations`).

## Running the API

```bash
uvicorn app.main:app --reload
```

On startup this creates the SQLite tables, initializes the three ChromaDB
collections (`topik_reading`, `topik_listening`, `topik_writing`), and seeds a
handful of dev/demo Reading + Writing questions into any collection that's
still empty (`app/database/seed_data.py`).

Key endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/api/exam/generate` | Session-aware blueprint exam for a `user_id` (avoids repeat questions) |
| `GET` | `/api/exam/fresh` | Stateless full exam: random Reading (50q) + random Writing (Q51-54) + one sequential past Listening round (`?listening_round=102nd`) with its audio path |
| `POST` | `/api/exam/submit` | Grade submitted Reading/Listening/Writing answers, log to history |
| `POST` | `/api/writing/grade-single` | Grade one Writing answer (Q51-54) in isolation |
| `GET` | `/api/user/{user_id}/analytics` | Weakness pattern report + AI-generated 1-week Myanmar study plan |

Interactive docs at `http://localhost:8000/docs` once the server is running.

## Ingesting real exam PDFs

The real Reading/Writing/Listening question banks come from scanned past-exam
PDFs, **not** from the dev seed data above. Source PDFs are scanned images
with no text layer, so ingestion uses the same vision-capable LLM (via
OpenRouter) to read each page rather than OCR/text parsing — `OPENROUTER_API_KEY`
must be set, and these calls cost real API credits and take a few minutes per
exam round.

1. Drop each exam round's PDFs into its own folder under `data/raw_exams/`
   (this whole directory is gitignored):

   ```
   data/raw_exams/
     102nd/
       *Reading-Test-Paper*.pdf
       *Reading-Answers*.pdf        (or one combined *Answers*.pdf covering all sections)
       *Writing-Test-Paper*.pdf
       *Writing-Answers*.pdf
       *Listening-Test-Paper*.pdf
       *Listening-Transcript*.pdf   (optional but recommended — see below)
       *Listening-Answers*.pdf
       *Listening-Audio*.mp3
   ```

   Filenames are matched by keyword (`reading`/`writing`/`listening`,
   `test`/`paper`, `answer`, `transcript`), not by exact name, so the
   folder/round name (e.g. `102nd`) is what matters — it becomes the
   `exam_round` metadata value and part of each question's id.

2. Run each ingestion script, optionally scoped to specific rounds:

   ```bash
   python -m app.database.ingest_reading [--rounds 102nd 96nd ...]
   python -m app.database.ingest_writing [--rounds 102nd 96nd ...]
   python -m app.database.ingest_listening_sets [--rounds 102nd 96nd ...]
   ```

   Notes:
   - A round with no dedicated per-section answer PDF (just one combined
     `*-Answers.pdf` covering Listening/Reading/Writing) is handled
     automatically via `app/database/answer_key_extraction.py`.
   - Listening prefers the Transcript PDF when present (it has the full
     dialogue script + printed options); without one, a round still ingests
     using just the printed question stems/options, flagged with
     `has_transcript=False` in metadata.
   - Each script prints a per-`question_type` count summary when done.

3. Sanity-check what's in the DB:

   ```bash
   python -m app.services.exam_generator
   ```

   Prints a sample `generate_full_topik_exam()` payload and a one-line
   per-section summary (question counts, points, exam rounds used).

## Tests

```bash
pytest
```

The suite is fully isolated (temp ChromaDB + temp SQLite per test, LLM calls
mocked with deterministic Myanmar-language canned responses) — it never
touches `data/` or costs API credits. One additional live test
(`test_live_writing_grader_produces_myanmar_feedback`) exercises the real
OpenRouter-backed grader and is automatically skipped unless
`OPENROUTER_API_KEY` is set in the environment.

## Project layout

```
app/
  config.py            # env/LLM config (OPENROUTER_API_KEY, base URL)
  database/
    vector_db.py        # ChromaDB client + collection helpers
    models.py            # SQLAlchemy models (User, ExamSession, QuestionLog, ...)
    seed_data.py          # small dev/demo question fixtures
    ingest_reading.py       # Q1-50 Reading PDF -> topik_reading
    ingest_writing.py        # Q51-54 Writing PDF -> topik_writing
    ingest_listening_sets.py  # Q1-50 Listening PDF/transcript -> topik_listening
    answer_key_extraction.py   # shared combined-answer-key PDF parser
  schemas/    # Pydantic request/response models
  services/   # business logic (exam generation, grading, analytics)
  prompts/    # LLM prompt templates
  routers/    # FastAPI route handlers
tests/
data/         # gitignored: raw_exams/ (source PDFs), chroma_db/, topik_ai.db
```
