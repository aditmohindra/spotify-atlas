"""
ML-2b pipeline runner: Multiple Feature Document Types.

Steps:
  1. Build scene / sound / behavior documents for all tracks
  2. Embed all three document types via OpenAI text-embedding-3-small
  3. Push each document type to its own Qdrant collection
"""

import os
import sys
import asyncio
import time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.services.feature_engineering_v2 import build_all_documents
from ml.embeddings.embedding_pipeline_v2 import run_embedding_pipeline_v2

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


async def main():
    total_start = time.time()

    print("=" * 60)
    print("ML-2b: Multiple Feature Document Types")
    print("=" * 60)

    # Step 1: Build documents
    print("\n[Step 1] Building scene / sound / behavior documents...")
    step1_start = time.time()
    db = SessionLocal()
    try:
        doc_results = await build_all_documents(db)
    finally:
        db.close()
    step1_elapsed = time.time() - step1_start
    print(f"[Step 1] Done in {step1_elapsed:.1f}s: {doc_results}")

    # Step 2 + 3: Embed and push to Qdrant
    print("\n[Step 2+3] Embedding documents and pushing to Qdrant...")
    step2_start = time.time()
    embed_results = await run_embedding_pipeline_v2()
    step2_elapsed = time.time() - step2_start
    print(f"[Step 2+3] Done in {step2_elapsed:.1f}s: {embed_results}")

    total_elapsed = time.time() - total_start
    print(f"\n{'=' * 60}")
    print(f"ML-2b complete in {total_elapsed:.1f}s")
    print(f"Documents: {doc_results}")
    print(f"Embeddings + Qdrant: {embed_results}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
