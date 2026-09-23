"""ChromaDB persistent client and collection helpers for TOPIK question retrieval."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

import chromadb
from chromadb.api.models.Collection import Collection
from chromadb.utils import embedding_functions

CHROMA_DB_PATH = Path(__file__).resolve().parents[2] / "data" / "chroma_db"
EMBEDDING_MODEL_NAME = "jhgan/ko-sroberta-multitask"

SkillArea = Literal["reading", "listening", "writing"]

COLLECTION_NAMES: dict[SkillArea, str] = {
    "reading": "topik_reading",
    "listening": "topik_listening",
    "writing": "topik_writing",
}

_client: chromadb.ClientAPI | None = None
_embedding_function: embedding_functions.SentenceTransformerEmbeddingFunction | None = None


def get_client() -> chromadb.ClientAPI:
    """Return the singleton persistent ChromaDB client, creating the storage dir if needed."""
    global _client
    if _client is None:
        CHROMA_DB_PATH.mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(path=str(CHROMA_DB_PATH))
    return _client


def get_embedding_function() -> embedding_functions.SentenceTransformerEmbeddingFunction:
    """Return the singleton Korean sentence-transformer embedding function."""
    global _embedding_function
    if _embedding_function is None:
        _embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=EMBEDDING_MODEL_NAME
        )
    return _embedding_function


def get_collection(domain: SkillArea) -> Collection:
    """Get or create the ChromaDB collection for a given TOPIK skill area."""
    client = get_client()
    return client.get_or_create_collection(
        name=COLLECTION_NAMES[domain],
        embedding_function=get_embedding_function(),
        metadata={"hnsw:space": "cosine"},
    )


def init_collections() -> dict[SkillArea, Collection]:
    """Ensure all three TOPIK collections exist. Call once on app startup."""
    return {domain: get_collection(domain) for domain in COLLECTION_NAMES}


def collection_is_empty(domain: SkillArea) -> bool:
    return get_collection(domain).count() == 0


def add_questions(
    domain: SkillArea,
    ids: list[str],
    documents: list[str],
    metadatas: list[dict[str, Any]],
) -> None:
    """Upsert questions into a collection. metadatas values must be str/int/float/bool."""
    get_collection(domain).upsert(ids=ids, documents=documents, metadatas=metadatas)


def _build_where(
    question_type: str | None,
    difficulty: str | None,
) -> dict[str, Any] | None:
    conditions: list[dict[str, Any]] = []
    if question_type is not None:
        conditions.append({"question_type": question_type})
    if difficulty is not None:
        conditions.append({"difficulty": difficulty})

    if not conditions:
        return None
    if len(conditions) == 1:
        return conditions[0]
    return {"$and": conditions}


def get_questions_by_ids(domain: SkillArea, ids: list[str]) -> dict[str, Any]:
    """Fetch specific questions by id, e.g. to grade a submission against masked answers."""
    if not ids:
        return {"ids": [], "documents": [], "metadatas": []}
    return get_collection(domain).get(ids=ids)


def get_questions_by_filter(
    domain: SkillArea,
    question_type: str | None = None,
    difficulty: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    """Fetch questions by exact metadata match (no semantic search)."""
    where = _build_where(question_type, difficulty)
    collection = get_collection(domain)
    if where is None:
        return collection.get(limit=limit)
    return collection.get(where=where, limit=limit)


def search_questions(
    domain: SkillArea,
    query_text: str,
    question_type: str | None = None,
    difficulty: str | None = None,
    n_results: int = 5,
) -> dict[str, Any]:
    """Semantic search for questions similar to query_text, optionally filtered by metadata."""
    where = _build_where(question_type, difficulty)
    collection = get_collection(domain)
    return collection.query(query_texts=[query_text], n_results=n_results, where=where)
