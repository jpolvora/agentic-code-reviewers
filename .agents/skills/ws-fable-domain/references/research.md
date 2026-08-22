# Domain Adapter: Research & Analysis

Specialized evidence and verification rules for research, technical analysis, documentation synthesis, and literature review.

---

## 1. Primary Sources & Authority
- **Authoritative Files:** Raw research papers, official documentation, source code repositories, benchmark logs, dataset files.
- **Forbidden Inputs:** Unverified AI summaries, blog posts without citations, memory of statistical figures.

## 2. Binding Minimum Evidence Set
Before formulating findings or writing research reports, the agent MUST inspect:
1. The primary reference document or source repository.
2. Official API reference or specification document.
3. Raw data files or benchmark output files.

## 3. Verification by Observation
- **Citation Traceability:** Every factual claim, benchmark figure, or technical assertion links to a specific file line, official URL, or raw log snippet.
- **Reproducibility:** Code snippets or queries in research findings are tested against real environments or tools where available.

## 4. Domain Frauds
1. **Hallucinated Citations:** Generating plausible-sounding URL citations or paper titles from memory without opening the page.
2. **P-Hacking / Cherry-Picking:** Presenting selective subset of data points while suppressing contradictory findings in raw logs.
3. **Dressing Guesses as Fact:** Presenting unverified inference as high-confidence research findings without low-confidence labeling.
