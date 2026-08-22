---
slug: {slug}
title: "{title}"
status: "plan to be refined"
---

## 0. Summary & Business Rules
Feature objectives, target business rules, security mitigations.

## 1. Definition of Ready & Scope
Resolved assumptions, measurable Acceptance Criteria (ACs), out-of-scope boundaries.

## 2. Technical Design & Architecture
Layer edits (per config.json layers): backend files, db schema, entity mappings. Frontend edits: pages, routes, API endpoints, styling, i18n keys. Invariant checks from config.json.invariants.

## 3. Step-by-Step Plan
Steps ordered by dependency, e.g.: Domain & Database → Application Core → Backend Unit Tests → Frontend & UI → Frontend Tests. For each step: action details, affected files, engineering checks.

## 4. Permissions, Tenancy & i18n
RBAC permissions, tenant data leakage isolation checks, dynamic i18n strings.

## 5. Test Coverage
Map each AC (AC1, AC2, ...) to specific test cases and method names.

## 6. Invariants (Do Not Violate)
Reiterate strict architectural invariants from config.json.invariants.

## 7. Pre-PR Checklist
- [ ] Layer boundaries respected.
- [ ] Domain entities and mappings encapsulated.
- [ ] Schema migrations created.
- [ ] Authorization checks applied.
- [ ] i18n keys declared.
- [ ] Test cases cover all ACs.

## 8. Open Questions
Ambiguities, blocked tasks, or architectural decisions requiring reviewer input.
