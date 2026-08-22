# Domain Adapter: DevOps & Infrastructure

Specialized evidence and verification rules for Infrastructure as Code (IaC), CI/CD pipelines, containerization, and live service configuration.

---

## 1. Primary Sources & Authority
- **Authoritative Files:** Terraform/OpenTofu files (`*.tf`), Dockerfiles, Kubernetes manifests (`*.yaml`), CI/CD workflow definitions (`.github/workflows/*.yml`), live deployment logs.
- **Forbidden Inputs:** Unverified memory of environment variables, assumptions about live cluster state.

## 2. Binding Minimum Evidence Set
Before modifying any infrastructure definition, the agent MUST inspect:
1. The active configuration file (`*.tf`, `Dockerfile`, `*.yaml`).
2. The current environment variable schema or secret reference definitions.
3. The dry-run or validation command output (`terraform plan`, `docker build --dry-run`, `kubectl diff`).

## 3. Verification by Observation
- **Dry-run verification:** Dry-run or plan execution passes with 0 syntax or reference errors.
- **State validation:** `terraform validate` or `kubectl lint / diff` succeeds.
- **Log inspection:** Container or pipeline execution logs demonstrate expected startup without crashloops.

## 4. Domain Frauds
1. **Unbudgeted Live Staging/Prod Deploy:** Applying changes directly to live clusters without explicit user confirmation.
2. **Hardcoded Credentials:** Embedding secrets, API keys, or private tokens directly in manifests instead of secret providers.
3. **Suppressed Failure Exit Codes:** Adding `|| true` or ignoring errors in CI script steps to force pipeline pass.
