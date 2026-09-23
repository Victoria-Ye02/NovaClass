# CLAUDE.md - TOPIK AI Prep Project Guidelines

## Stack
- Backend: FastAPI, Python 3.10+, Pydantic v2
- Vector DB: ChromaDB (Local Persistent)
- LLM: LangChain `ChatOpenAI` routed through OpenRouter (`anthropic/claude-sonnet-5`), using `OPENROUTER_API_KEY` and base URL `https://openrouter.ai/api/v1`
- Embeddings: Korean SentenceTransformers (`jhgan/ko-sroberta-multitask`)
- Relational DB: SQLite via SQLAlchemy (User History & Progress)

## Architectural Rules
1. Modular Architecture: Keep DB, Services, Prompt Templates, and Routers separate.
2. Type Safety: Strictly use Pydantic Models for all API Requests & Responses.
3. Language Rules: All AI Explanations, Feedbacks, and UI Responses MUST be in Myanmar Language (မြန်မာဘာသာ).
4. TOPIK Rules:
   - Reading: Q1-Q50 structure (Grammar, Main Idea, Graph, Details).
   - Listening: Q1-Q50 structure (Dialogue, Continuation, Place, Purpose).
   - Writing: Q51 (10 pts), Q52 (10 pts), Q53 (30 pts), Q54 (50 pts).