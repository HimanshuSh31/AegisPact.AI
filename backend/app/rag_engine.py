import os
import json
import math
import logging
import httpx
from typing import List, Dict, Any, Tuple, Optional
from pydantic import BaseModel, Field

# Set up logging
logger = logging.getLogger("contract_auditor.rag_engine")

# Define Pydantic schema for constrained LLM outputs
class ComplianceAuditOutput(BaseModel):
    status: str = Field(description="Must be one of: COMPLIANT, NON_COMPLIANT, WARNING, NOT_APPLICABLE")
    clause_text: Optional[str] = Field(None, description="The exact verbatim quote from the contract acting as proof or context")
    page_number: Optional[int] = Field(None, description="The page number where the clause was found (integer)")
    explanation: str = Field(description="Detailed reason explaining the classification based on the framework criteria")
    severity: str = Field(description="Severity of issue: HIGH, MEDIUM, LOW, INFO (use INFO if compliant)")

# ---------------------------------------------------------
# 1. Semantic Chunker
# ---------------------------------------------------------
class SemanticChunker:
    """
    Groups document sentences into semantically cohesive chunks.
    Utilizes semantic boundary analysis (headings, double newlines) and token lengths.
    """
    def __init__(self, target_chunk_size: int = 500, overlap: int = 50):
        self.target_chunk_size = target_chunk_size
        self.overlap = overlap

    def chunk_document(self, doc_manifest: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Takes a document manifest (parsed pages) and splits them into chunks.
        Keeps track of source page numbers.
        """
        chunks = []
        chunk_idx = 0

        for page in doc_manifest.get("pages", []):
            page_num = page["page_number"]
            text = page["text"]
            
            # Simple sentence tokenizer by punctuation
            sentences = []
            temp = ""
            for char in text:
                temp += char
                if char in [".", "?", "!"] and len(temp.strip()) > 10:
                    sentences.append(temp.strip())
                    temp = ""
            if temp.strip():
                sentences.append(temp.strip())

            # Also consider tables as individual chunks
            for table in page.get("tables", []):
                chunks.append({
                    "chunk_id": f"doc_chunk_{chunk_idx}",
                    "page_number": page_num,
                    "text": f"Table on Page {page_num}:\n{table['markdown']}",
                    "is_table": True,
                    "bbox": table.get("bbox")
                })
                chunk_idx += 1

            # Semantic grouping: accumulate sentences until they hit target size
            current_chunk = []
            current_len = 0
            for sentence in sentences:
                sentence_len = len(sentence.split())
                if current_len + sentence_len > self.target_chunk_size and current_chunk:
                    # Save current chunk
                    chunks.append({
                        "chunk_id": f"doc_chunk_{chunk_idx}",
                        "page_number": page_num,
                        "text": " ".join(current_chunk),
                        "is_table": False,
                        "bbox": None
                    })
                    chunk_idx += 1
                    # Keep overlap sentences
                    overlap_size = 0
                    overlap_chunk = []
                    for s in reversed(current_chunk):
                        s_len = len(s.split())
                        if overlap_size + s_len < self.overlap:
                            overlap_chunk.insert(0, s)
                            overlap_size += s_len
                        else:
                            break
                    current_chunk = overlap_chunk
                    current_len = overlap_size

                current_chunk.append(sentence)
                current_len += sentence_len

            if current_chunk:
                chunks.append({
                    "chunk_id": f"doc_chunk_{chunk_idx}",
                    "page_number": page_num,
                    "text": " ".join(current_chunk),
                    "is_table": False,
                    "bbox": None
                })
                chunk_idx += 1

        logger.info(f"Generated {len(chunks)} chunks from document manifest.")
        return chunks

# ---------------------------------------------------------
# 2. Sparse Search: BM25
# ---------------------------------------------------------
class BM25Retriever:
    """
    In-memory BM25 sparse search engine for quick deployment and reliable exact matching.
    """
    def __init__(self, chunks: List[Dict[str, Any]], k1: float = 1.5, b: float = 0.75):
        self.chunks = chunks
        self.k1 = k1
        self.b = b
        self.doc_len = []
        self.corpus_size = len(chunks)
        self.avg_doc_len = 0.0
        self.doc_freqs = []
        self.idf = {}
        self.vocab = set()
        self._initialize()

    def _tokenize(self, text: str) -> List[str]:
        return text.lower().translate(str.maketrans("", "", '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~')).split()

    def _initialize(self):
        total_len = 0
        df = {}
        for chunk in self.chunks:
            tokens = self._tokenize(chunk["text"])
            self.doc_len.append(len(tokens))
            total_len += len(tokens)
            
            # Term frequencies within this document
            freqs = {}
            for token in tokens:
                freqs[token] = freqs.get(token, 0) + 1
            self.doc_freqs.append(freqs)
            
            # Document frequency across corpus
            for token in set(tokens):
                df[token] = df.get(token, 0) + 1
                self.vocab.add(token)

        self.avg_doc_len = total_len / self.corpus_size if self.corpus_size > 0 else 1.0

        for token, freq in df.items():
            # Standard BM25 IDF calculation
            self.idf[token] = math.log((self.corpus_size - freq + 0.5) / (freq + 0.5) + 1.0)

    def search(self, query: str, top_k: int = 5) -> List[Tuple[float, Dict[str, Any]]]:
        query_tokens = self._tokenize(query)
        scores = []

        for idx in range(self.corpus_size):
            score = 0.0
            doc_len = self.doc_len[idx]
            freqs = self.doc_freqs[idx]

            for token in query_tokens:
                if token not in self.vocab:
                    continue
                tf = freqs.get(token, 0)
                # BM25 scoring formula
                numerator = tf * (self.k1 + 1)
                denominator = tf + self.k1 * (1 - self.b + self.b * doc_len / self.avg_doc_len)
                score += self.idf[token] * (numerator / denominator)

            scores.append((score, self.chunks[idx]))

        # Sort by score descending
        scores.sort(key=lambda x: x[0], reverse=True)
        return scores[:top_k]

# ---------------------------------------------------------
# 3. Dense Search / Embedding Client (Qdrant & Local Fallback)
# ---------------------------------------------------------
class DenseRetriever:
    """
    Interacts with Qdrant to index and search dense vectors.
    Falls back to a Mock Vector DB in-memory if Qdrant/Ollama is not available.
    """
    def __init__(self, qdrant_url: str, ollama_base_url: str):
        self.qdrant_url = qdrant_url
        self.ollama_base_url = ollama_base_url
        # Local mock storage if Qdrant connection fails
        self._mock_db: Dict[str, List[Dict[str, Any]]] = {} 

    async def get_embedding(self, text: str) -> List[float]:
        """
        Retrieves embedding using local Ollama model (nomic-embed-text) or falls back to mock vector.
        """
        try:
            async with httpx.AsyncClient(timeout=1.0) as client:
                response = await client.post(
                    f"{self.ollama_base_url}/api/embeddings",
                    json={"model": "nomic-embed-text", "prompt": text}
                )
                if response.status_code == 200:
                    return response.json()["embedding"]
        except Exception as e:
            logger.warning(f"Ollama embeddings unavailable ({e}). Using deterministic mock embeddings.")
        
        # Deterministic mock embedding (length 384 for standard lightweight testing)
        val = sum(ord(c) for c in text) % 384
        return [float((val + i) % 10) / 10.0 for i in range(384)]

    async def index_chunks(self, document_id: int, chunks: List[Dict[str, Any]]):
        """
        Embeds and stores chunks in the Vector DB (Qdrant or mock storage).
        """
        logger.info(f"Indexing {len(chunks)} chunks for document {document_id}")
        indexed_chunks = []
        for chunk in chunks:
            vector = await self.get_embedding(chunk["text"])
            indexed_chunks.append({
                "chunk_id": chunk["chunk_id"],
                "text": chunk["text"],
                "page_number": chunk["page_number"],
                "vector": vector
            })
        
        self._mock_db[str(document_id)] = indexed_chunks
        
        # Try indexing in real Qdrant if available
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Create collection
                collection_name = f"doc_{document_id}"
                await client.put(f"{self.qdrant_url}/collections/{collection_name}", json={
                    "vectors": {"size": len(indexed_chunks[0]["vector"]), "distance": "Cosine"}
                })
                
                # Batch upload points
                points = []
                for idx, item in enumerate(indexed_chunks):
                    points.append({
                        "id": idx,
                        "vector": item["vector"],
                        "payload": {"text": item["text"], "page_number": item["page_number"]}
                    })
                await client.post(f"{self.qdrant_url}/collections/{collection_name}/points", json={
                    "points": points
                })
                logger.info(f"Successfully indexed document {document_id} into Qdrant collection {collection_name}")
        except Exception as e:
            logger.warning(f"Failed to connect to Qdrant ({e}). Falling back to local in-memory mock search.")

    async def search(self, document_id: int, query: str, top_k: int = 5) -> List[Tuple[float, Dict[str, Any]]]:
        """
        Performs vector cosine similarity search.
        """
        query_vector = await self.get_embedding(query)
        collection_name = f"doc_{document_id}"

        # Try Qdrant search
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(
                    f"{self.qdrant_url}/collections/{collection_name}/points/search",
                    json={
                        "vector": query_vector,
                        "limit": top_k,
                        "with_payload": True
                    }
                )
                if response.status_code == 200:
                    results = response.json().get("result", [])
                    return [(r["score"], {"text": r["payload"]["text"], "page_number": r["payload"]["page_number"]}) for r in results]
        except Exception as e:
            pass

        # Fallback Mock Cosine Similarity
        doc_chunks = self._mock_db.get(str(document_id), [])
        if not doc_chunks:
            return []

        def cosine_similarity(v1, v2):
            dot = sum(a*b for a, b in zip(v1, v2))
            norm1 = math.sqrt(sum(a*a for a in v1))
            norm2 = math.sqrt(sum(b*b for b in v2))
            return dot / (norm1 * norm2) if (norm1 * norm2) > 0 else 0.0

        scores = []
        for chunk in doc_chunks:
            sim = cosine_similarity(query_vector, chunk["vector"])
            scores.append((sim, {"text": chunk["text"], "page_number": chunk["page_number"]}))

        scores.sort(key=lambda x: x[0], reverse=True)
        return scores[:top_k]

# ---------------------------------------------------------
# 4. Hybrid Search Orchestration (RRF)
# ---------------------------------------------------------
class HybridSearchEngine:
    def __init__(self, dense_retriever: DenseRetriever):
        self.dense_retriever = dense_retriever

    async def retrieve(self, document_id: int, all_chunks: List[Dict[str, Any]], query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Combines Dense and Sparse retrievers using Reciprocal Rank Fusion (RRF).
        """
        # Initialize BM25 with current chunks
        sparse_retriever = BM25Retriever(all_chunks)
        
        # Run retrievals in parallel
        sparse_results = sparse_retriever.search(query, top_k=top_k * 2)
        dense_results = await self.dense_retriever.search(document_id, query, top_k=top_k * 2)

        # Apply Reciprocal Rank Fusion (RRF)
        # RRF Score = 1 / (60 + rank)
        rrf_scores = {}
        
        # Helper to trace rank
        for rank, (_, chunk) in enumerate(sparse_results):
            text = chunk["text"]
            rrf_scores[text] = rrf_scores.get(text, 0) + (1.0 / (60.0 + rank + 1))
            
        for rank, (_, chunk) in enumerate(dense_results):
            text = chunk["text"]
            # Dense retriever might return formatted chunks or raw Dicts
            rrf_scores[text] = rrf_scores.get(text, 0) + (1.0 / (60.0 + rank + 1))

        # Reconstruct final ranked list
        combined = []
        seen = set()
        
        # Combine lists to extract page metadata
        all_retrieved = [c for _, c in sparse_results] + [c for _, c in dense_results]
        
        for item in all_retrieved:
            txt = item["text"]
            if txt in seen:
                continue
            seen.add(txt)
            combined.append({
                "text": txt,
                "page_number": item.get("page_number"),
                "rrf_score": rrf_scores[txt]
            })

        # Sort by RRF score descending
        combined.sort(key=lambda x: x["rrf_score"], reverse=True)
        return combined[:top_k]

# ---------------------------------------------------------
# 5. LLM Prompting & Constrained Validation
# ---------------------------------------------------------
class LLMAuditor:
    def __init__(self, ollama_base_url: str, model_name: str):
        self.ollama_base_url = ollama_base_url
        self.model_name = model_name

    async def audit_rule(
        self,
        rule: Dict[str, Any],
        context_chunks: List[Dict[str, Any]]
    ) -> ComplianceAuditOutput:
        """
        Executes a compliance audit of a single rule against retrieved document context chunks.
        Enforces a JSON structure output matching ComplianceAuditOutput.
        """
        # Format the retrieved context for the prompt
        formatted_context = ""
        for idx, chunk in enumerate(context_chunks):
            formatted_context += f"[Context Segment {idx + 1} - Page {chunk.get('page_number')}]:\n{chunk['text']}\n\n"

        prompt = f"""
You are a Principal Corporate Compliance Auditor checking a contract against a specific regulatory rule.
Your evaluation must be entirely objective, factual, and backed by the provided context.

CRITICAL INSTRUCTIONS:
1. You must output a valid JSON block matching this schema:
{{
  "status": "COMPLIANT" | "NON_COMPLIANT" | "WARNING" | "NOT_APPLICABLE",
  "clause_text": "verbatim quote from the text",
  "page_number": <page number where the clause is found, integer>,
  "explanation": "detailed analysis of why",
  "severity": "HIGH" | "MEDIUM" | "LOW" | "INFO"
}}
2. Status definitions:
   - COMPLIANT: The rule criteria is explicitly satisfied.
   - NON_COMPLIANT: The contract explicitly violates the rule, or completely lacks mandatory provisions required by the rule.
   - WARNING: There is a partial match, vague language, or elevated risk.
   - NOT_APPLICABLE: The rule does not apply to this contract scope.
3. Every claim of violation or compliance MUST cite the exact 'clause_text' from the context, and specify the exact 'page_number'.
4. Do NOT include markdown styling or outer wrapper text. Return ONLY the JSON object.

---
[RULE TO AUDIT]
Rule ID: {rule.get('rule_id')}
Title: {rule.get('title')}
Compliance Criteria: {rule.get('description')}

---
[CONTRACT CONTEXT]
{formatted_context}
---

Your response (JSON ONLY):
"""

        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.post(
                    f"{self.ollama_base_url}/api/generate",
                    json={
                        "model": self.model_name,
                        "prompt": prompt,
                        "system": "You are a precise corporate audit AI. You only communicate using strict JSON.",
                        "stream": False,
                        "options": {
                            "temperature": 0.0 # Strict deterministic reasoning
                        }
                    }
                )
                
                if response.status_code == 200:
                    raw_content = response.json().get("response", "").strip()
                    # Parse the JSON string
                    # Basic JSON cleaner in case model wraps it in markdown blocks
                    if "```json" in raw_content:
                        raw_content = raw_content.split("```json")[1].split("```")[0].strip()
                    elif "```" in raw_content:
                        raw_content = raw_content.split("```")[1].split("```")[0].strip()
                    
                    data = json.loads(raw_content)
                    return ComplianceAuditOutput(**data)
                    
        except Exception as e:
            logger.error(f"Error querying Ollama LLM / parsing JSON: {e}")

        # Fail-safe mock response in case LLM is offline or output is invalid
        # This keeps the worker/pipeline functional
        return ComplianceAuditOutput(
            status="WARNING",
            clause_text="Mock Mode: Could not connect to local LLM worker.",
            page_number=1,
            explanation=f"Fail-safe warning triggered. Failed to audit rule '{rule.get('title')}' due to local model offline status.",
            severity="MEDIUM"
        )
