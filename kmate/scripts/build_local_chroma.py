"""Builds the K.Mate TOPIK vector store on this machine, from the OCR text that is already extracted.

The pages of the TOPIK II papers were OCR'd once (database/extracted_text.json), so rebuilding needs no OCR:
only chunking and embedding, about a minute. The store is written to kmate/chroma_local, which ai_service.py
uses before it tries the remote ChromaDB server. Run from the kmate/ folder:  python scripts/build_local_chroma.py
"""
import json
import os
import time

import chromadb
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "database", "extracted_text.json")
TARGET = os.path.join(ROOT, "chroma_local")
COLLECTION = "topik_collection"


def main():
    pages = json.load(open(SOURCE, encoding="utf-8"))
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50, separators=["\n\n", "\n", ".", " "])
    chunks = []
    for page in pages:
        for piece in splitter.split_text(page["text"]):
            chunks.append({"text": piece, "source": page["source"], "page": page["page"]})
    print(f"{len(pages)} pages -> {len(chunks)} chunks")

    started = time.time()
    model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    embeddings = model.encode([c["text"] for c in chunks], show_progress_bar=True).tolist()
    print(f"embedded in {time.time() - started:.0f}s")

    client = chromadb.PersistentClient(path=TARGET)
    try:
        client.delete_collection(COLLECTION)
    except Exception:
        pass
    collection = client.create_collection(COLLECTION)
    collection.add(
        documents=[c["text"] for c in chunks],
        embeddings=embeddings,
        metadatas=[{"source": c["source"], "page": str(c["page"])} for c in chunks],
        ids=[f"chunk_{i}" for i in range(len(chunks))],
    )
    print(f"stored {collection.count()} chunks in {TARGET}")


if __name__ == "__main__":
    main()
