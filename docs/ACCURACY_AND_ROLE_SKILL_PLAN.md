# Accuracy And Role Skill Plan

## 1. Purpose

เอกสารนี้เพิ่มชั้นความแม่นยำให้ Team AI Agent ก่อนเริ่ม implementation จริง เป้าหมายคือทำให้บริษัท AI ไม่ใช่แค่มี role เยอะ แต่ต้องมี role ที่ทำงานต่างกันจริง, ตรวจสอบกันได้, วัดคุณภาพได้, และรู้ว่าเมื่อไหร่ควร retry, escalate, หรือหยุด.

หลักคิดสำคัญ:

1. **ไม่มี role ไหนอนุมัติงานตัวเองได้** งานสำคัญต้องผ่าน verifier หรือ lead role อีกชั้น
2. **ทุก output ต้องมี evidence** เช่น source file, requirement, test result, diff, log, screenshot, หรือ artifact link
3. **ทุก phase ต้องมี quality gate** ก่อนส่งต่อ department ถัดไป
4. **ทุก role ต้องมี skill boundary** ไม่ให้ PM เขียนโค้ด, QA ตัดสิน architecture, หรือ DevOps เปลี่ยน scope เอง
5. **ทุก mission ต้องวัด accuracy ได้** ผ่าน score, defect loop, eval set, audit log, และ final acceptance

## 2. Defect Audit Of Current Plan

### P0: Must Fix Before Building Real Agent Runtime

| Defect | Why It Matters | Fix |
|---|---|---|
| Roles are listed but not skill-scored | Agent อาจทำงานทับกันหรือมั่วหน้าที่ | Add role skill matrix and capability boundaries |
| No RACI model | ไม่ชัดว่าใคร responsible, accountable, consulted, informed | Add RACI per phase |
| No independent verification chain | Agent อาจยืนยันงานตัวเองทั้งที่ผิด | Add reviewer/verifier roles for each artifact |
| No accuracy metrics | วัดไม่ได้ว่างานดีขึ้นหรือแย่ลง | Add scoring per role, phase, mission |
| No ambiguity handling | User brief คลุมเครือแล้ว AI อาจเดาเกินไป | Add assumption log and ambiguity detector |
| No eval harness | เปลี่ยน prompt หรือ role แล้วไม่รู้ regression | Add mission benchmark set and golden checks |
| No conflict resolution | PM, CTO, QA, DevOps อาจตัดสินใจขัดกัน | Add escalation and tie-break rules |
| No output schema governance | Role output อาจเป็น prose สวยแต่ใช้ต่อไม่ได้ | Add schema versioning and validation |

### P1: Should Fix Before Git/Deployment Autopilot

| Defect | Why It Matters | Fix |
|---|---|---|
| Autopilot permissions too broad conceptually | เสี่ยง push/deploy ผิดที่ | Add action class, environment scope, cost/runtime ceilings |
| Tool failures not typed enough | แก้ปัญหายากเมื่อ tool ล้ม | Add tool failure taxonomy |
| No rollback decision policy | Deploy แล้วพังจะไม่รู้ว่า rollback เมื่อไหร่ | Add release gate and rollback trigger |
| No security review ownership | Security role มีชื่อแต่ยังไม่มี gate | Security QA and Security Engineer must approve risky releases |
| No prompt/version audit | เปลี่ยน prompt แล้ว output เปลี่ยนโดยตามไม่ได้ | Version role prompts and run configs |

### P2: Improve During Product Maturity

| Defect | Why It Matters | Fix |
|---|---|---|
| Too many roles may create UI noise | ผู้ใช้จะงงว่าใครทำอะไร | Show phase-active roles only, full org chart separate |
| Pixel scene may overpromise real progress | ภาพขยับแต่ระบบจริงไม่คืบ | Pixel state must consume backend event state only |
| Memory can become polluted | AI จำสิ่งผิดและนำไปใช้ซ้ำ | Add memory confidence, source, expiry, reviewer |
| Cost estimation may be inaccurate | ผู้ใช้ไม่ trust Autopilot | Track estimated vs actual by phase and role |

## 3. Accuracy Framework

### Accuracy Types

| Accuracy Type | Definition | Primary Owner | Verifier |
|---|---|---|---|
| Requirement accuracy | เข้าใจสิ่งที่ผู้ใช้ต้องการถูกต้อง | PM, Lead BA | CPO, QA Lead |
| Business-rule accuracy | เงื่อนไข workflow, edge case, policy ถูกต้อง | Lead BA | PM, Manual QA |
| Technical accuracy | architecture, dependencies, implementation path ถูกต้อง | CTO, Tech Lead | Solution Architect |
| Code accuracy | code ทำงาน, maintainable, ไม่พังส่วนอื่น | FE/BE/Fullstack | Tech Lead, QA Automation |
| Test accuracy | test ครอบคลุม requirement และ bug จริง | QA Lead | Automation QA, Manual QA |
| Deployment accuracy | deploy ถูก environment, ตรวจ health ได้ | DevOps Lead | SRE, Release Manager |
| Security accuracy | auth, secrets, access, injection, data privacy ปลอดภัย | Security Engineer | Security QA |
| Documentation accuracy | final report, release note, handoff ตรงกับสิ่งที่ทำจริง | Technical Writer | Chief of Staff |
| Cost accuracy | estimate และ actual cost โปร่งใส | Finance Manager | COO |

### Accuracy Score

ทุก artifact สำคัญควรมีคะแนน 0-100 แยก 5 มิติ:

```txt
completeness      ครบตาม requirement หรือไม่
correctness       ถูกต้องตาม evidence หรือไม่
consistency       ไม่ขัดกับ artifact อื่นหรือ context เดิม
verifiability     ตรวจสอบซ้ำได้จาก test/log/source หรือไม่
risk_control      ระบุและจัดการ risk สำคัญหรือไม่
```

Recommended thresholds:

| Gate | Minimum Score |
|---|---|
| Planning gate | 80 |
| Technical design gate | 82 |
| Implementation gate | 85 |
| QA gate | 88 |
| Deployment gate | 90 |
| Final report gate | 85 |

ถ้าต่ำกว่า threshold:

1. ส่งกลับ owner role พร้อม defect list
2. Retry ได้สูงสุดตาม policy
3. ถ้ายังไม่ผ่าน ให้ escalate ไป lead/executive role
4. ถ้ากระทบ permission, cost, security, deploy ให้ mission เข้า `blocked` หรือ `needs_setup`

## 4. Evidence-First Output Rule

ทุก role output ต้องประกอบด้วย:

```txt
summary
decision
evidence
assumptions
risks
open_questions
next_actions
confidence_score
```

### Evidence Examples

| Work Type | Valid Evidence |
|---|---|
| Requirement | user brief, linked ticket, PRD section, assumption log |
| Code | changed files, diff, test output, build output |
| UI | screenshot, component path, accessibility check |
| API | endpoint contract, schema, test response, log |
| QA | test cases, pass/fail results, reproduction steps |
| Deployment | build ID, deploy log, smoke test, rollback plan |
| Cost | token usage, tool runtime, provider cost record |

No evidence means low confidence, even if the prose looks good.

## 5. RACI By Mission Phase

RACI:

- **R** Responsible: ทำงานหลัก
- **A** Accountable: รับผิดชอบผลลัพธ์สุดท้าย
- **C** Consulted: ให้ข้อมูลหรือรีวิว
- **I** Informed: รับทราบ

| Phase | R | A | C | I |
|---|---|---|---|---|
| Intake | PM, Lead BA | CPO | CEO, CTO | Chief of Staff |
| Executive triage | CEO, COO, CTO, CPO | CEO | PM, Finance, Legal | All leads |
| Discovery | Lead BA, BA, UX Researcher | PM | QA Lead, Solution Architect | CPO |
| Planning | PM, Project Manager, Tech Lead | CPO | Lead BA, QA Lead, COO | CEO |
| Design | Product Designer, UX Writer | CPO | FE Lead, Accessibility QA | PM |
| Architecture | Solution Architect, Tech Lead | CTO | BE, FE, DB, DevOps, Security | Engineering Director |
| Implementation | FE, BE, Fullstack, DB, AI Engineer | Tech Lead | QA Automation, Security Engineer | PM |
| QA | QA Lead, Manual QA, Automation QA | QA Lead | Tech Lead, BA, Product Designer | PM, CTO |
| Fix loop | Assigned developer, QA | Tech Lead | QA Lead, PM | CTO |
| Release | DevOps Lead, Release Manager | COO | SRE, Security Engineer, QA Lead | CEO, PM |
| Monitoring | SRE | DevOps Lead | Release Manager, Support | COO |
| Final report | Technical Writer, Chief of Staff | CEO | PM, Tech Lead, QA Lead, DevOps | User |

## 6. Role Skill Matrix

Skill levels:

- **5 Expert**: can own and approve within role boundary
- **4 Strong**: can produce high-quality work independently
- **3 Working**: can contribute but needs review
- **2 Basic**: can understand and support
- **1 Awareness**: should not own work

### Executive

| Role | Strategy | Product | Technical | Delivery | Risk | People/Capacity | Finance | Communication | Approval Rights |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| CEO | 5 | 4 | 2 | 4 | 5 | 4 | 4 | 5 | Mission outcome, final report |
| COO | 4 | 3 | 2 | 5 | 5 | 5 | 4 | 4 | Operating plan, release readiness |
| CTO | 4 | 3 | 5 | 4 | 5 | 3 | 2 | 4 | Architecture, technical risk |
| CPO | 4 | 5 | 2 | 4 | 4 | 3 | 2 | 5 | Product scope, acceptance criteria |
| Chief of Staff | 4 | 3 | 2 | 5 | 4 | 4 | 3 | 5 | Status integrity, final narrative |

### Product And Analysis

| Role | Requirements | Business Rules | UX Flow | Prioritization | Data | Edge Cases | Writing | Approval Rights |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Product Manager | 5 | 4 | 4 | 5 | 3 | 4 | 5 | PRD, scope |
| Project Manager | 3 | 2 | 2 | 4 | 2 | 3 | 4 | Timeline, dependencies |
| Scrum Master | 2 | 2 | 2 | 3 | 1 | 3 | 4 | Blocker process |
| Lead BA | 5 | 5 | 4 | 4 | 4 | 5 | 5 | Business rules, acceptance matrix |
| Business Analyst | 4 | 5 | 3 | 3 | 3 | 5 | 4 | Requirement detail |
| UX Researcher | 4 | 3 | 5 | 3 | 3 | 4 | 4 | User journey assumptions |
| Data Analyst | 3 | 3 | 2 | 3 | 5 | 4 | 3 | Metrics and event taxonomy |

### Design

| Role | UX Architecture | UI Craft | Design System | Accessibility | UX Copy | Frontend Awareness | Approval Rights |
|---|---:|---:|---:|---:|---:|---:|---|
| Product Designer | 5 | 4 | 3 | 4 | 4 | 3 | Flow and screen behavior |
| UI Designer | 4 | 5 | 4 | 4 | 3 | 3 | Visual design states |
| Design System Designer | 3 | 5 | 5 | 5 | 3 | 4 | Component consistency |
| UX Writer | 4 | 2 | 3 | 4 | 5 | 2 | Labels, errors, empty states |

### Engineering

| Role | Architecture | Frontend | Backend | Database | AI/Prompt | Integration | Code Review | Testing | Approval Rights |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Solution Architect | 5 | 3 | 5 | 4 | 3 | 4 | 4 | 3 | System design |
| Tech Lead | 5 | 4 | 4 | 4 | 3 | 4 | 5 | 4 | Implementation plan, code quality |
| Fullstack Developer | 3 | 4 | 4 | 3 | 2 | 3 | 3 | 3 | Feature implementation |
| Frontend Developer | 2 | 5 | 2 | 1 | 1 | 2 | 3 | 3 | UI implementation |
| Backend Developer | 3 | 1 | 5 | 4 | 2 | 4 | 3 | 3 | API/service implementation |
| Database Engineer | 3 | 1 | 3 | 5 | 1 | 2 | 3 | 3 | Schema/migration/indexes |
| AI/ML Engineer | 3 | 2 | 3 | 2 | 5 | 3 | 3 | 4 | Agent/model behavior |
| Prompt Engineer | 2 | 1 | 2 | 1 | 5 | 2 | 2 | 4 | Prompt templates, eval cases |
| Integration Engineer | 3 | 2 | 4 | 3 | 2 | 5 | 3 | 3 | External API adapters |

### QA And Verification

| Role | Test Strategy | Manual Testing | Automation | Security | Performance | Accessibility | Defect Triage | Approval Rights |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| QA Lead | 5 | 4 | 4 | 3 | 3 | 4 | 5 | QA signoff |
| Manual QA | 3 | 5 | 2 | 2 | 2 | 3 | 4 | Manual behavior report |
| Automation QA | 4 | 3 | 5 | 2 | 3 | 3 | 4 | Test automation result |
| Security QA | 3 | 2 | 3 | 5 | 2 | 2 | 4 | Security findings |
| Performance QA | 3 | 2 | 4 | 2 | 5 | 2 | 4 | Performance report |
| Accessibility QA | 3 | 4 | 3 | 2 | 2 | 5 | 4 | Accessibility signoff |

### DevOps And Reliability

| Role | CI/CD | Cloud | Infra | Monitoring | Security | Rollback | Release Comms | Approval Rights |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| DevOps Lead | 5 | 4 | 4 | 4 | 4 | 5 | 3 | Deployment plan |
| SRE | 4 | 4 | 4 | 5 | 3 | 5 | 3 | Health check, rollback signal |
| Cloud Architect | 4 | 5 | 5 | 4 | 4 | 4 | 2 | Cloud architecture |
| Release Manager | 4 | 3 | 3 | 4 | 3 | 5 | 5 | Release readiness |
| Security Engineer | 3 | 3 | 4 | 3 | 5 | 4 | 3 | Runtime/security approval |

### Operations

| Role | Capacity | Cost | Compliance | Documentation | Customer Impact | Memory | Communication | Approval Rights |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| HR Manager | 5 | 2 | 2 | 2 | 2 | 3 | 4 | Role capacity plan |
| Finance Manager | 2 | 5 | 3 | 3 | 3 | 2 | 4 | Cost budget |
| Legal/Compliance Agent | 2 | 3 | 5 | 4 | 4 | 3 | 4 | Compliance risk |
| Customer Success Agent | 2 | 2 | 3 | 4 | 5 | 3 | 5 | Customer-facing note |
| Technical Writer | 3 | 2 | 2 | 5 | 4 | 4 | 5 | Documentation |
| Knowledge Manager | 3 | 3 | 3 | 4 | 3 | 5 | 4 | Durable memory |

## 7. Role Boundaries

### Hard Boundaries

| Role | Must Not Do |
|---|---|
| CEO | Edit code, override QA evidence, hide risk |
| PM | Approve technical architecture alone |
| Lead BA | Deploy, merge, or alter technical solution without Tech Lead |
| Designer | Approve accessibility alone without Accessibility QA |
| FE/BE Developer | Sign off own implementation without review |
| QA | Change product scope without PM |
| DevOps | Deploy code that failed QA gate |
| Finance | Block mission silently without clear cost evidence |
| Knowledge Manager | Save memory without source/evidence |

### Approval Separation

```txt
Creator role -> Reviewer role -> Gate owner -> Phase transition
```

Examples:

- PM creates PRD -> Lead BA reviews -> CPO approves planning gate
- FE implements UI -> Tech Lead reviews -> QA Lead verifies behavior
- DevOps prepares deploy -> SRE validates health -> Release Manager approves release
- Technical Writer drafts report -> Chief of Staff verifies -> CEO approves final report

## 8. Verification Gates

### Planning Gate

Required artifacts:

- Mission charter
- Scope in/out
- Acceptance criteria
- Assumption log
- Risk list
- Task graph draft

Verifier roles:

- CPO
- Lead BA
- QA Lead

Pass criteria:

- No critical ambiguity
- Acceptance criteria measurable
- Scope not contradictory
- Risks assigned to owners

### Technical Gate

Required artifacts:

- Architecture notes
- Affected files/modules
- Implementation plan
- Test plan draft
- Security risk checklist

Verifier roles:

- CTO
- Solution Architect
- Tech Lead
- Security Engineer for risky tasks

Pass criteria:

- Clear module boundaries
- Dependencies known
- Rollback path exists for risky changes
- Test strategy matches implementation

### Implementation Gate

Required artifacts:

- Code diff or patch
- Build output
- Unit/integration test output
- Developer notes
- Known limitations

Verifier roles:

- Tech Lead
- Automation QA

Pass criteria:

- Code compiles
- Tests pass or failures documented
- No unrelated changes
- Acceptance criteria mapped to implementation

### QA Gate

Required artifacts:

- Test matrix
- Automation result
- Manual QA notes
- Defect list
- Accessibility/security/performance notes when relevant

Verifier roles:

- QA Lead
- PM
- Tech Lead

Pass criteria:

- Critical and high defects closed
- Regression risk documented
- Manual and automation results agree or conflict is resolved

### Release Gate

Required artifacts:

- Deployment plan
- Environment target
- Build ID
- Smoke test plan
- Rollback plan
- Release notes

Verifier roles:

- DevOps Lead
- SRE
- Release Manager
- Security Engineer if required

Pass criteria:

- Correct environment
- Rollback path ready
- Smoke test can verify core behavior
- No blocking security finding

## 9. Ambiguity Handling

Because user wants full autopilot, the system should not ask too many questions. But it also must not invent critical facts.

### Ambiguity Classes

| Class | Example | Action |
|---|---|---|
| Low | Button label tone, minor layout order | Assume and log |
| Medium | Optional feature behavior, report format | Choose default, log assumption, mark reviewable |
| High | Data deletion, payment, auth boundary, production deploy | Block or request setup/confirmation depending policy |
| Critical | Secret exposure, legal risk, destructive production action | Stop mission phase and escalate |

### Assumption Log

Every mission stores:

```txt
assumption
source
confidence
impact
owner_role
review_status
```

Assumptions must appear in final report.

## 10. Eval Harness

Before real Autopilot, create a benchmark set of missions.

### Mission Benchmark Categories

1. Simple UI feature
2. CRUD backend feature
3. Bug fix
4. Test improvement
5. Refactor with no behavior change
6. Deployment-only task
7. Security-sensitive task
8. Ambiguous brief
9. Multi-role full feature
10. Failure case with missing integration

### Eval Dimensions

| Dimension | Check |
|---|---|
| Role selection | Did the orchestrator choose the right roles? |
| Plan quality | Is the plan complete, minimal, and sequenced? |
| Artifact quality | Are required artifacts structured and useful? |
| Tool usage | Were tools used correctly and safely? |
| Verification | Did QA catch intended defects? |
| Final report | Does it match what actually happened? |
| Cost/time | Was estimate vs actual reasonable? |

### Regression Rule

Any change to:

- role prompt
- output schema
- workflow phase handler
- tool permission policy
- model routing

must run the benchmark missions relevant to that area.

## 11. Model And Tool Routing

### Role Routing

| Work Type | Model Need | Tool Need |
|---|---|---|
| Executive summary | strong reasoning, concise writing | artifacts, audit events |
| Requirements | long context, structured output | docs, issue tracker |
| Architecture | strong reasoning, codebase context | repo search, dependency graph |
| Coding | code generation, tool use | file tools, shell, tests |
| QA | adversarial reasoning, evidence reading | tests, browser, logs |
| DevOps | procedural correctness | CI/CD, deploy adapters |
| Security | cautious reasoning | code search, dependency scan |

### Tool Permission Rule

Tools are assigned to roles by default, then restricted by mission policy.

Example:

```txt
Frontend Developer can read/write UI files
Tech Lead can read/write across implementation scope
QA can run tests and browser checks
DevOps can run deploy tools only in allowed environments
Finance can read cost records but cannot change code
```

## 12. Memory Accuracy

Memory is useful only if it is reliable.

### Memory Record

```txt
title
content
source_artifact_id
source_mission_id
created_by_role_id
reviewed_by_role_id
confidence_score
expires_at
tags
```

### Memory Rules

- Do not save raw secrets
- Do not save unverified assumptions as facts
- Mark temporary decisions with expiry
- Link memory to source artifacts
- Knowledge Manager creates memory, but domain owner reviews it

## 13. Conflict Resolution

### Conflict Types

| Conflict | Tie-break Owner |
|---|---|
| Product scope vs timeline | CPO, then CEO |
| Technical purity vs delivery speed | CTO, then CEO |
| QA failure vs release pressure | QA Lead for quality, COO for schedule, CEO final |
| Cost vs mission completion | Finance Manager, COO final |
| Security risk vs feature delivery | Security Engineer can block, CEO can only override with audit record |
| UX preference vs accessibility | Accessibility QA wins |

### Conflict Artifact

Conflicts must create an artifact:

```txt
conflict_summary
options
roles_involved
decision
rationale
risk_accepted
approved_by
```

## 14. Revised Build Order

Add **Phase -1: Accuracy Foundation** before the existing Phase 0.

### Phase -1: Accuracy Foundation

Deliverables:

1. Role skill matrix in code
2. Role boundary definitions
3. Output schemas per role group
4. RACI map per mission phase
5. Accuracy scoring utility
6. Assumption log model
7. Artifact verifier interface
8. Mission benchmark fixtures
9. Eval runner skeleton
10. Audit event taxonomy

Definition of done:

- Every role has skills, tools, boundaries, output schema
- Every phase has creator, reviewer, gate owner
- Every artifact can be scored
- Mock mission can show assumption log and verification result

### Then Continue Phase 0

After Phase -1, build the frontend mock MVP using these same role and verification contracts, so UI never becomes detached from the real orchestration model.

## 15. Recommended Code Artifacts To Create First

```txt
packages/shared/src/types/roles.ts
packages/shared/src/types/skills.ts
packages/shared/src/types/accuracy.ts
packages/shared/src/types/artifacts.ts
packages/shared/src/types/workflow.ts
packages/agent-core/src/roles/role-registry.ts
packages/agent-core/src/roles/role-skill-matrix.ts
packages/workflow/src/raci/phase-raci.ts
packages/workflow/src/gates/quality-gates.ts
packages/workflow/src/scoring/accuracy-score.ts
packages/workflow/src/assumptions/assumption-log.ts
packages/workflow/src/evals/mission-benchmarks.ts
```

## 16. MVP Accuracy UI Additions

Add these UI elements to the first mock screen:

1. **Accuracy Score Badge** on mission and artifacts
2. **Assumption Log Panel** in Mission Inspector
3. **Verifier Chain** showing creator -> reviewer -> gate owner
4. **Quality Gate Timeline** in Mission Control
5. **Role Skill Drawer** in Org Chart
6. **Conflict/Risk Card** in Activity Feed
7. **Evidence Links** on every artifact

This makes the product feel trustworthy from the first prototype, not after backend implementation.

## 17. Pre-Implementation Checklist

Do not start real agent execution until these are true:

- [ ] Role skill matrix exists
- [ ] Role boundaries exist
- [ ] Output schemas exist for every active role
- [ ] Mission phase RACI exists
- [ ] Quality gates exist
- [ ] Assumption log exists
- [ ] Accuracy scoring exists
- [ ] Artifact verifier interface exists
- [ ] Audit event taxonomy exists
- [ ] Mock benchmark missions exist
- [ ] UI can display verification and evidence

## 18. Final Recommendation

The next implementation step should not be plain UI scaffold yet. It should be:

1. Create shared role/skill/accuracy types
2. Create role registry and skill matrix
3. Create mock mission using those real contracts
4. Build HQ + Mission Control UI from those contracts

This keeps the pixel company interface honest: every room, sprite, event, artifact, and quality badge maps back to real orchestration logic.
