# Domain Adapter Template: [Domain Name]

An adapter customizes evidence rules and fraud definitions for a specific field while keeping the core `ws-fable-method` 7-step loop intact.

---

## 1. Primary Sources & Authority
- **Authoritative Files / Inputs:** [List primary configuration files, schemas, or raw data files]
- **Forbidden Inputs:** [Recall, memory, unverified 3rd party summaries]

## 2. Binding Minimum Evidence Set
Before Step 3 (Decide), the agent **MUST** open and inspect all of the following:
1. `[Primary Config / State File]`
2. `[Live Output / Log / Metric]`
3. `[Validation Schema / Spec]`

## 3. Verification by Observation
What constitutes empirical proof in this domain?
- **Command / Tool:** `[e.g., terraform plan / kubectl get / pytest]`
- **Success Criteria:** `[Exit code 0, zero errors, matching state schema]`

## 4. Domain Frauds
Watch for these field-specific failure patterns:
1. **[Fraud 1 Name]:** [Description & detection rule]
2. **[Fraud 2 Name]:** [Description & detection rule]
3. **[Fraud 3 Name]:** [Description & detection rule]
