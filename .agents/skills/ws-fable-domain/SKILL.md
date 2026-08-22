---
name: ws-fable-domain
description: Domain adapter generator & schemas — binds domain authority, minimum evidence sets, observation rules, and fraud definitions for DevOps, Data, Research, and Ops.
version: 0.3.30
invocation_names:
  - ws-fable-domain
  - /ws-fable-domain
  - fable-domain
  - /fable-domain
---

# Fable Domain (`ws-fable-domain`)

> When this skill is loaded, output "ws-fable-domain loaded."

Domain adapters customize what counts as **evidence**, who holds **authority**, what **verification by observation** means, and what **frauds** look like for non-standard task domains.

An adapter alters domain nouns and evidence requirements, but **never changes the core 7-step loop**.

---

## Domain Adapter Architecture

Each domain adapter must reside under `references/` or a domain directory and conform to [`references/TEMPLATE.md`](references/TEMPLATE.md):

1. **Domain Identity:** Target field (e.g., DevOps, Data Analysis, Research, Marketing).
2. **Authority & Primary Sources:** What files/logs/documents MUST be opened before making decisions.
3. **Binding Minimum Evidence Set:** Non-negotiable mandatory reads before Step 3 (Decide).
4. **Verification By Observation:** Domain-specific execution commands or state checks.
5. **Domain Frauds:** Specific dishonesty or shortcut patterns unique to this field.

---

## Generating New Domain Adapters

To create a new adapter bundle:

```
/ws-fable-domain create <domain-name>
```

1. **Interview / Identify:** Identify target domain, primary tools, and common failure traps.
2. **Draft Adapter:** Use `references/TEMPLATE.md` as schema.
3. **Define Binding Evidence:** List 2–4 mandatory primary sources (e.g. IaC state file, cloud logs, raw dataset headers).
4. **Define Domain Frauds:** List 3 domain-specific false completion patterns.
5. **Save Adapter:** Save to `{skillsRoot}/ws-fable-domain/references/<domain-name>.md`.

---

## Available Reference Adapters

- [`devops.md`](references/devops.md): Infrastructure as Code (Terraform, Docker, K8s, CI/CD pipelines, live state checks).
- [`research.md`](references/research.md): Primary document research, literature synthesis, citation verification.
- [`TEMPLATE.md`](references/TEMPLATE.md): Standard schema for crafting custom domain adapters.

**Done when:** adapter file exists under `{skillsRoot}/ws-fable-domain/references/` with required schema sections.
