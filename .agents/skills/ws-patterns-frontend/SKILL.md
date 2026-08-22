---
name: ws-patterns-frontend
version: 0.3.30
description: Frontend UI/UX patterns & component preferences engine — consults frontend.md before frontend tasks and records learned UI/UX conventions after implementation or user corrections.
invocation_names:
  - ws-patterns-frontend
  - patterns-frontend
---

# Frontend Patterns (`ws-patterns-frontend`)

> When this skill is loaded, output "ws-patterns-frontend loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

**Bidirectional pattern engine** — `{sharedDir}/frontend.md` is both input (consult before frontend tasks) and output (record learned preferences after work or user corrections).

Expand path tokens first ([`tools.md`](../ws-shared/tools.md) § Path tokens): `{sharedDir}` → `.agents/skills/ws-shared`.

Consumer-owned frontend patterns live in `{sharedDir}/frontend.md` (never overwritten by install/update).

## When to run

| Moment | Action |
|--------|--------|
| **Before frontend code / UI component / review** | **Consult:** Read `{sharedDir}/frontend.md` for UI/UX rules, validation styling, i18n requirements, form components, and dropdown behavior. Enforce matching patterns strictly. |
| **After implementation or user correction** | **Record:** If a new frontend UI/UX pattern or user correction was identified, prompt the user via `user-gate`: `Register this preference in frontend.md? ("<short summary of preference>")`. On approval, append the entry to `{sharedDir}/frontend.md`. |
| **No new pattern identified** | Proof line: `Frontend Patterns: Consulted ({sharedDir}/frontend.md)` |

## Consult protocol (Mandatory before frontend code)

1. Read `{sharedDir}/frontend.md` (if missing, seed from `{sharedDir}/frontend.md.template` or create header).
2. Check for matching categories:
   - **Form Validation**: Messages always in red below component.
   - **Localization**: Always use i18n keys instead of hardcoded text strings.
   - **Dropdowns / FK selects**: Prefer searchable auto-complete dropdowns with backend pagination and filtering for foreign-key tables.
   - **Styling / Layout**: Glassmorphism, CSS variables, dark mode rules.
3. Apply active rules directly to the frontend component implementation.

## Record protocol (Post-implementation / User correction)

When completing frontend tasks or receiving UI/frontend corrections from the user:
1. Identify if a new frontend preference/rule was established (e.g. "Validation error messages must always appear in red below input component", "Use i18n for all visible text", "Use searchable autocomplete dropdowns for foreign keys").
2. Prompt the user via `user-gate`:
   - **Question**: `Register this preference in frontend.md? ("<short summary of preference>")`
   - **Options**: `Yes (Register preference)` / `No (Skip)`
3. If approved, append to `{sharedDir}/frontend.md`:
   ```markdown
   #### [YYYY-MM-DD] <Category / Rule Title>
   - **Rule**: <Short summary of requirement>
   - **Context/Rationale**: <Why this preference was established>
   - **Example / UI Pattern**: <UI pattern snippet or component structure>
   ```

## Done when

- Pre-work: `{sharedDir}/frontend.md` read and applied to frontend edits.
- Completion: User prompted via `user-gate` if new preference identified, and entry appended to `{sharedDir}/frontend.md` if approved; or proof line `Frontend Patterns: Consulted`.

## Subagent contract

- Read the configured frontend pattern file before touching UI paths.
- Apply only rules whose path or component context matches the assignment.
- Do not invent a project preference when the pattern file is silent.
- Ask before recording a newly observed preference.
- Return `pattern_consult` with the source path and applied rule titles.
