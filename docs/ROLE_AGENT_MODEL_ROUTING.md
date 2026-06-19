# Role Agent And Model Routing

## 1. Purpose

เอกสารนี้ตรวจสอบความเหมาะสมว่าแต่ละ role ใน Team AI Agent ควรใช้ agent/runtime แบบใด และควรใช้ model tier ใดเป็นค่าเริ่มต้น.

Milestone C ใช้ Ollama เป็น execution provider จริง โดย `qwen3:8b` ทำหน้าที่ Product Manager planner และ Lead BA verifier บนเครื่อง ส่วน tier อื่นเป็น target สำหรับการขยายครบทุก role ในอนาคต.

อ้างอิงการตัดสินใจ:

- Ollama รองรับ local model API, structured outputs, streaming, และ usage metrics สำหรับ orchestration ที่แอปเป็นเจ้าของเอง.
- Qwen3 มีหลายขนาด ทำให้ route งานตามความซับซ้อนและทรัพยากรเครื่องได้โดยไม่เสียค่า cloud API.
- Ollama structured outputs รองรับ JSON schema สำหรับ planner และ verifier โดยไม่ต้องใช้ cloud API key.

Source links:

- https://docs.ollama.com/capabilities/structured-outputs
- https://docs.ollama.com/api
- https://ollama.com/library/qwen3

## 2. Routing Principles

1. **Largest local tier only where it earns its compute**: CEO, CTO, Solution Architect, Tech Lead, AI/ML, Security, Compliance, and high-risk Cloud architecture.
2. **Professional default for production work**: PM, BA, Design, FE, BE, Fullstack, QA Lead, DevOps, Release Manager, and Technical Writer.
3. **Mini for repeatable low-risk roles**: Project Manager, Scrum Master, UX Writer, Manual QA, HR, Finance, Customer Success.
4. **Nano is fallback only for now**: low-risk high-volume future workloads, not active mission ownership yet.
5. **Verifier roles use stronger reasoning than draft roles**: QA Lead, Security QA, Accessibility QA, SRE, Security Engineer, CPO, CTO, and Chief of Staff must validate evidence, not just produce text.
6. **Operator roles are policy-bound**: DevOps and Release roles can operate staging only by default; production deploy is forbidden until explicit policy is added.
7. **No role gets tools just because the model can use them**: routing tools must be a subset of role default tools and mission policy.

## 3. Runtime Kinds

| Runtime kind | Used for | Typical model tier |
|---|---|---|
| `executive_reasoning` | final outcome, conflict resolution, operating accountability | frontier/professional |
| `structured_planning` | PRD, scope, schedule, prompt/eval planning | professional/mini |
| `business_analysis` | requirements, edge cases, rules, acceptance matrix | professional |
| `design_reasoning` | UX flow, UI states, design-system consistency | professional |
| `code_architect` | architecture, implementation planning, code review | frontier/professional |
| `code_builder` | FE/BE/fullstack/test implementation | professional |
| `qa_verifier` | evidence review, manual/automation/accessibility/performance QA | professional/mini |
| `security_verifier` | security, compliance, runtime risk | frontier |
| `devops_operator` | CI/CD, staging deploy, monitoring, rollback | professional/frontier |
| `operations_analyst` | capacity, budget, operational reporting | mini |
| `documentation_writer` | UX copy, release notes, final reports, docs | mini/professional |
| `memory_curator` | durable memory with evidence and expiry | professional |

## 4. Role Routing Summary

| Role group | Roles | Routing decision |
|---|---|---|
| Executive | CEO, CTO | `frontier` target (`qwen3:14b`), high/xhigh reasoning because they approve outcome and technical risk |
| Executive ops | COO, CPO, Chief of Staff, Engineering Director | `professional`, high/medium reasoning, verifier/drafting based on gate authority |
| Product | PM, Lead BA, BA, UX Researcher, Data Analyst | `professional` except low-risk coordination roles |
| Coordination | Project Manager, Scrum Master | `mini`, because work is frequent, structured, and low tool risk |
| Design | Product Designer, UI Designer, Design System Designer | `professional`, browser-aware but no deployment authority |
| UX copy | UX Writer | `mini`, upgrades later if copy becomes final customer/legal surface |
| Engineering leads | Solution Architect, Tech Lead | `frontier`, because architecture/code review mistakes are expensive |
| Engineering builders | Fullstack, FE, BE, DB, Integration | `professional`, local write tools only |
| AI behavior | AI/ML Engineer | `frontier`, because routing and agent behavior affect the whole company |
| Prompt work | Prompt Engineer | `professional`, must pair changes with benchmark coverage |
| QA lead/security | QA Lead, Security QA | `professional/frontier`, verifier mode |
| QA execution | Manual QA, Automation QA, Performance QA, Accessibility QA | mini/professional based on tool risk and specialty |
| DevOps | DevOps Lead, SRE, Release Manager | `professional`, staging operator/verifier only |
| Cloud/Security | Cloud Architect, Security Engineer | `frontier`, high/xhigh reasoning |
| Operations | HR, Finance, Customer Success | `mini`, read-only or drafting |
| Compliance/Memory | Legal/Compliance, Knowledge Manager | `frontier/professional`, because mistakes pollute risk or durable memory |
| Docs | Technical Writer | `professional`, because final report must align with artifacts |

## 5. Suitability Findings

### Good Fits

- **Tech Lead and Solution Architect use frontier**: appropriate because they own architecture, implementation plan, and code review.
- **FE/BE/Fullstack use professional code builder**: appropriate because they need tools and coding capability but should not approve their own work.
- **Security QA, Security Engineer, Legal/Compliance use strong verifier tiers**: appropriate because false confidence here is expensive.
- **Project Manager, Scrum Master, HR, Finance, Customer Success use mini**: appropriate because most work is structured, frequent, and low tool risk.
- **Knowledge Manager uses professional memory curator**: appropriate because memory pollution can degrade future missions.

### Adjustments Made During Review

- Added `knowledge_base` to common read tools because routing requires durable context for most roles.
- Added `file_read` for CTO/QA-style analysis where evidence from code or tests is needed.
- Added `browser_check` to Frontend Developer because frontend work needs rendered verification.
- Added `file_write` and `shell_command` to Automation QA only, not QA Lead or Manual QA, because test implementation is coding work.
- Kept production deploy forbidden in model routing for all roles until explicit production policy exists.

### Risks Still To Watch

- **Compute risk**: `qwen3:14b` roles must be used selectively on a 16 GB machine. Do not route every planning subtask to the largest local tier.
- **Over-authority risk**: professional or frontier models still need policy gates; model strength is not permission.
- **Verifier independence risk**: creator and verifier must remain separate even if they share model tier.
- **Prompt drift risk**: any routing or prompt change must run mission benchmarks.
- **Model availability risk**: model IDs are centralized in `MODEL_IDS` so future upgrades are one config change, followed by verification.

## 6. Code Locations

- Routing type: `packages/shared/src/types/model-routing.ts`
- Routing config: `packages/config/src/model-routing/agent-model-routing.ts`
- Role registry: `packages/agent-core/src/roles/role-registry.ts`
- Skill matrix: `packages/agent-core/src/roles/role-skill-matrix.ts`
- Validation script: `scripts/verify/foundation.mjs`

## 7. Verification

The foundation verifier now checks:

- every role has a routing profile,
- every routing profile uses a known central model ID,
- routing required tools are allowed by the role definition,
- forbidden tools are not also required,
- `nano` tier cannot own write/deploy risk,
- production-deploy risk requires frontier tier,
- security verifier roles use verifier autonomy and a sufficiently strong tier.

Current verified result:

```txt
Roles: 43
Operational phases with RACI: 12
Quality gates: 6
Mission benchmarks: 10
Agent model routing profiles: 43
```
