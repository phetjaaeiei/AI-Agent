# Team AI Agent Implementation Structure Plan

## 1. Recommendation

ควรวางโครงสร้างละเอียดก่อน แล้วค่อยเริ่ม build หน้าแรกตามที่แนะนำคือ **HQ + Mission Control**.

เหตุผลคือ product นี้ไม่ใช่แค่ UI เกมหรือ chatbot แต่เป็นระบบ orchestration ขนาดใหญ่ที่ต้องเชื่อม 4 ชั้นเข้าด้วยกัน:

1. **Product shell**: หน้าเว็บ, dashboard, command input, logs, artifacts
2. **Pixel strategy layer**: ภาพบริษัท, ห้อง, agent sprites, state animation
3. **Agent orchestration layer**: role, task graph, workflow, handoff, tool calls
4. **Execution layer**: repo, code, tests, deployments, docs, integrations

ถ้าเริ่มจาก UI ทันทีโดยไม่มี structure จะเสี่ยงได้แค่ mockup ที่สวยแต่ต่อ agent จริงลำบาก. แผนนี้จึงกำหนดแกนระบบก่อน แล้วค่อย build MVP อย่างเป็นขั้น.

## 2. Product Architecture Overview

```txt
User
  |
  v
Web App: HQ / Mission Control / Org Chart / Artifacts
  |
  v
API Gateway: auth, workspace, mission, artifacts, realtime
  |
  v
Mission Orchestrator
  |
  +--> Role Registry
  +--> Workflow Engine
  +--> Agent Runtime
  +--> Tool Runner
  +--> Artifact Store
  +--> Audit Log
  +--> Memory Store
  |
  v
External Systems: Git, CI/CD, Cloud, Issue Tracker, Slack, Email, Docs
```

## 3. Recommended Tech Direction

### MVP Stack

ใช้ monorepo TypeScript เป็นหลักก่อน เพราะ frontend, API, shared types, agent runtime, และ workflow state จะ share schema กันง่าย.

| Layer | Recommendation | Reason |
|---|---|---|
| Web app | Next.js or React Router SPA | สร้าง product UI, realtime dashboard, และ component system ได้เร็ว |
| API | Node.js TypeScript service | แชร์ types กับ frontend และ agent packages |
| Worker | Node.js TypeScript worker | รัน mission jobs, agent runs, tool calls |
| Database | PostgreSQL | ข้อมูล mission, tasks, artifacts, audit logs เป็น relational ชัด |
| Queue | Redis/BullMQ first, later durable workflow engine | MVP ง่ายก่อน แล้วค่อยขยับไป workflow engine ที่ทนทานขึ้น |
| Realtime | Server-Sent Events first, WebSocket later | Event feed แบบ one-way เพียงพอสำหรับ MVP |
| Object storage | Local filesystem first, S3-compatible later | เก็บ artifacts, screenshots, reports, logs |
| UI styling | Tailwind or CSS modules with design tokens | ต้องคุม density, state, และ responsive |
| Pixel scene | DOM grid or Canvas first | เริ่มง่าย, debug ง่าย, accessibility overlay ทำง่าย |

### Production Direction

เมื่อ MVP ทำงานจริงแล้วค่อยเพิ่ม:

- Durable workflow engine สำหรับ long-running mission
- Sandboxed tool runner สำหรับ code execution
- Multi-tenant workspace isolation
- Model provider gateway
- Secret vault
- Deployment adapters
- Permission policy engine
- Observability stack

## 4. Monorepo Structure

```txt
team-ai-agent/
  apps/
    web/
      app/
      components/
      features/
      styles/
      public/
      tests/
    api/
      src/
        modules/
        routes/
        middleware/
        realtime/
        server.ts
      tests/
    worker/
      src/
        jobs/
        runners/
        schedulers/
        worker.ts
      tests/

  packages/
    shared/
      src/
        types/
        schemas/
        constants/
        events/
    db/
      prisma-or-drizzle/
      migrations/
      seeds/
    agent-core/
      src/
        runtime/
        roles/
        prompts/
        planners/
        evaluators/
        memory/
    workflow/
      src/
        mission-state-machine/
        task-graph/
        phase-handlers/
        policies/
    tool-runner/
      src/
        tools/
        sandbox/
        adapters/
        permissions/
    integrations/
      src/
        github/
        gitlab/
        linear/
        slack/
        cloud/
        ci/
    ui/
      src/
        primitives/
        layout/
        mission/
        pixel/
        charts/
    pixel-engine/
      src/
        scene/
        sprites/
        rooms/
        animations/
        state-mapper/
    config/
      src/
        env/
        feature-flags/
        model-routing/

  docs/
    TEAM_AI_AGENT_DETAILED_DESIGN.md
    IMPLEMENTATION_STRUCTURE_PLAN.md
    ROLE_REGISTRY.md
    WORKFLOW_SPEC.md
    DATA_MODEL.md

  scripts/
    dev/
    seed/
    verify/

  PRODUCT.md
  DESIGN.md
  package.json
  turbo.json
```

## 5. Frontend Structure

### App Routes

```txt
apps/web/app/
  layout.tsx
  page.tsx                         # redirect to /hq
  hq/
    page.tsx                       # HQ Command Room
  missions/
    page.tsx                       # mission list
    [missionId]/
      page.tsx                     # Mission Control
      trace/
        page.tsx                   # audit trace
      artifacts/
        page.tsx                   # mission artifacts
  company/
    page.tsx                       # org chart
    roles/
      [roleId]/
        page.tsx                   # role detail
  departments/
    [departmentId]/
      page.tsx                     # department room detail
  artifacts/
    page.tsx                       # global artifact hub
  qa-lab/
    page.tsx                       # QA overview
  deployments/
    page.tsx                       # deployment dashboard
  integrations/
    page.tsx                       # integrations setup
  settings/
    page.tsx                       # workspace settings
```

### Feature Modules

```txt
apps/web/features/
  mission-command/
    MissionCommandDock.tsx
    MissionComposer.tsx
    MissionModeSelector.tsx
    AttachmentPicker.tsx
  hq/
    HQShell.tsx
    TopHud.tsx
    DepartmentHealthStrip.tsx
    ActiveMissionPanel.tsx
  mission-control/
    MissionTimeline.tsx
    TaskGraph.tsx
    RoleAssignmentBoard.tsx
    ArtifactDrawer.tsx
    PhaseGatePanel.tsx
  pixel-office/
    PixelOfficeScene.tsx
    DepartmentRoom.tsx
    AgentSprite.tsx
    WorkItemToken.tsx
    SceneStatusEffects.tsx
  activity-feed/
    ActivityFeed.tsx
    ActivityEventRow.tsx
    FeedFilters.tsx
  org-chart/
    OrgChartCanvas.tsx
    RoleCard.tsx
    RoleInspector.tsx
  artifacts/
    ArtifactList.tsx
    ArtifactPreview.tsx
    DiffPreview.tsx
    ReportPreview.tsx
  qa/
    TestMatrix.tsx
    FailureLoopPanel.tsx
    ManualQaNotes.tsx
  deployments/
    ReleasePipeline.tsx
    EnvironmentCard.tsx
    RollbackPanel.tsx
```

### UI Layout Rules

- Left rail: navigation only
- Top HUD: current mission, risk, cost, active agents
- Center: pixel office or mission workspace
- Right inspector: selected entity detail
- Bottom dock/feed: command input and event stream
- Never make the first screen a landing page
- Pixel visuals must not hide logs, test output, artifacts, or final reports

## 6. Backend Structure

### API Modules

```txt
apps/api/src/modules/
  workspace/
  missions/
  agents/
  roles/
  departments/
  tasks/
  artifacts/
  audit-events/
  tool-calls/
  qa-reports/
  deployments/
  integrations/
  settings/
  realtime/
```

### API Endpoints

```txt
POST   /api/missions
GET    /api/missions
GET    /api/missions/:id
POST   /api/missions/:id/start
POST   /api/missions/:id/pause
POST   /api/missions/:id/stop
GET    /api/missions/:id/events
GET    /api/missions/:id/tasks
GET    /api/missions/:id/artifacts
GET    /api/missions/:id/report

GET    /api/roles
GET    /api/roles/:id
PATCH  /api/roles/:id/config

GET    /api/departments
GET    /api/departments/:id

GET    /api/artifacts
GET    /api/artifacts/:id

GET    /api/audit-events
GET    /api/tool-calls/:id

GET    /api/integrations
POST   /api/integrations/:provider/connect
PATCH  /api/settings/autopilot-policy
```

### Worker Jobs

```txt
apps/worker/src/jobs/
  create-mission-plan.job.ts
  assign-roles.job.ts
  run-agent-task.job.ts
  run-tool-call.job.ts
  evaluate-artifact.job.ts
  run-qa-gate.job.ts
  run-deployment-gate.job.ts
  generate-final-report.job.ts
  persist-memory.job.ts
```

## 7. Agent Core Structure

### Agent Runtime Concepts

```txt
Mission
  has many MissionPhases
  has many Tasks
  has many AgentRuns
  has many Artifacts
  has many AuditEvents

AgentRole
  has department
  has responsibilities
  has tools
  has prompt template
  has output schema
  has permission policy

AgentRun
  belongs to Mission
  belongs to AgentRole
  consumes context
  produces artifacts/events/tasks
```

### Role Registry Package

```txt
packages/agent-core/src/roles/
  index.ts
  executive.roles.ts
  product.roles.ts
  design.roles.ts
  engineering.roles.ts
  qa.roles.ts
  devops.roles.ts
  operations.roles.ts
```

Each role should define:

```ts
type AgentRoleDefinition = {
  id: string;
  name: string;
  department: DepartmentId;
  level: "executive" | "lead" | "senior" | "staff" | "specialist";
  responsibilities: string[];
  defaultTools: ToolId[];
  inputSchema: string;
  outputSchema: string;
  promptTemplateId: string;
  canCreateTasks: boolean;
  canApprovePhaseGate: boolean;
  canRunExternalTools: boolean;
};
```

### Role Groups

1. Executive: CEO, COO, CTO, CPO, Chief of Staff
2. Product: PM, Project Manager, Scrum Master, Lead BA, BA, UX Researcher
3. Design: Product Designer, UI Designer, Design System Designer, UX Writer
4. Engineering: Solution Architect, Tech Lead, FE, BE, Fullstack, DB, AI, Integration
5. QA: QA Lead, Manual QA, Automation Test, Security QA, Performance QA, Accessibility QA
6. DevOps: DevOps Lead, SRE, Cloud Architect, Release Manager, Security Engineer
7. Operations: HR, Finance, Legal, Customer Success, Technical Writer, Knowledge Manager

## 8. Mission Workflow

### Phase State Machine

```txt
created
  -> intake
  -> executive_triage
  -> discovery
  -> planning
  -> design
  -> architecture
  -> implementation
  -> qa
  -> fix_loop
  -> release
  -> monitoring
  -> final_report
  -> completed

Any phase
  -> needs_setup
  -> blocked
  -> cancelled
  -> failed
```

### Phase Handlers

```txt
packages/workflow/src/phase-handlers/
  intake.handler.ts
  executive-triage.handler.ts
  discovery.handler.ts
  planning.handler.ts
  design.handler.ts
  architecture.handler.ts
  implementation.handler.ts
  qa.handler.ts
  fix-loop.handler.ts
  release.handler.ts
  monitoring.handler.ts
  final-report.handler.ts
```

Each phase handler should:

1. Load mission context
2. Select required roles
3. Create role-specific tasks
4. Run agents
5. Validate output schemas
6. Save artifacts
7. Emit audit events
8. Decide next phase

## 9. Task Graph Model

Task graph is the bridge between "company simulation" and "real work".

```txt
Task
  id
  missionId
  title
  description
  ownerRoleId
  departmentId
  phase
  status
  priority
  dependencies
  artifactIds
  acceptanceCriteria
  riskLevel
  estimate
```

### Task Status

```txt
queued
assigned
running
waiting_for_dependency
blocked
reviewing
failed
passed
completed
cancelled
```

### Visual Mapping

| Task status | Pixel office visual |
|---|---|
| queued | Work item token appears in department inbox |
| assigned | Token moves to role desk |
| running | Agent sprite animates at desk |
| blocked | Desk shows red/amber alert marker |
| reviewing | Token moves to lead/QA desk |
| passed | Green check appears over token |
| completed | Token moves to artifact shelf |

## 10. Data Model

### Core Tables

```txt
workspaces
users
workspace_members
missions
mission_phases
departments
agent_roles
agent_role_configs
agent_runs
tasks
task_dependencies
artifacts
artifact_versions
tool_calls
audit_events
qa_reports
qa_findings
deployments
deployment_checks
integrations
integration_credentials
memory_items
cost_records
```

### Mission

```txt
id
workspace_id
title
brief
mode
status
current_phase
risk_level
cost_limit
estimated_completion
created_by
created_at
updated_at
completed_at
```

### Agent Run

```txt
id
mission_id
task_id
role_id
status
model_provider
model_name
input_summary
output_summary
artifact_ids
started_at
completed_at
cost_estimate
error_message
```

### Artifact

```txt
id
workspace_id
mission_id
task_id
created_by_role_id
type
title
summary
storage_key
mime_type
version
status
created_at
```

Artifact types:

```txt
mission_charter
prd
user_story
technical_design
ui_spec
code_patch
test_plan
test_result
qa_report
deployment_log
release_note
final_report
memory_note
```

### Audit Event

```txt
id
workspace_id
mission_id
actor_type
actor_id
event_type
severity
title
summary
payload_json
created_at
```

Audit event examples:

```txt
mission.created
role.assigned
task.created
agent.started
agent.completed
tool.requested
tool.completed
artifact.created
qa.failed
qa.passed
deployment.started
deployment.completed
mission.completed
```

## 11. Pixel Engine Structure

The pixel engine should be a visualization layer, not the source of truth.

Source of truth:

- Mission state
- Task graph
- Agent run state
- Department health
- Audit events

Pixel engine consumes these states and renders:

- Rooms
- Agents
- Work item tokens
- Status effects
- Movement paths
- Department load

```txt
packages/pixel-engine/src/
  scene/
    createOfficeScene.ts
    officeLayout.ts
    camera.ts
  rooms/
    executive.room.ts
    product.room.ts
    design.room.ts
    engineering.room.ts
    qa.room.ts
    devops.room.ts
    operations.room.ts
  sprites/
    agentSprite.ts
    workItemSprite.ts
    statusMarker.ts
  animations/
    idle.animation.ts
    typing.animation.ts
    reviewing.animation.ts
    testing.animation.ts
    deploying.animation.ts
    blocked.animation.ts
  state-mapper/
    missionToSceneState.ts
    taskToSpriteState.ts
    departmentToRoomState.ts
```

### Scene State

```ts
type OfficeSceneState = {
  departments: DepartmentSceneState[];
  agents: AgentSceneState[];
  workItems: WorkItemSceneState[];
  selectedEntity?: SceneEntityRef;
  activeMissionId?: string;
};
```

### Accessibility Rule

Every sprite and room must have an equivalent readable panel row. The canvas can be decorative and interactive, but information cannot exist only inside the canvas.

## 12. Permissions And Autopilot Policy

Autopilot can run end to end, but permissions must be explicit at workspace level.

### Policy Fields

```txt
allow_code_read
allow_code_write
allow_branch_create
allow_pr_create
allow_pr_merge
allow_ci_run
allow_staging_deploy
allow_production_deploy
allow_external_message_send
allow_secret_read_by_tools
max_cost_per_mission
max_runtime_minutes
allowed_repositories
allowed_environments
requires_security_gate_for_release
```

### Action Classes

| Action class | Example | MVP default |
|---|---|---|
| Read | read repo, read docs | allowed after integration |
| Draft | create plan, generate patch | allowed |
| Write local | modify workspace branch | allowed in sandbox/local |
| Write remote | push branch, open PR | requires integration permission |
| Deploy staging | deploy preview/staging | configurable |
| Deploy production | production release | disabled until explicitly enabled |
| External comms | Slack/email/customer note | disabled until explicitly enabled |

## 13. Event-Driven UI Contract

Frontend should not poll large mission data repeatedly. Backend emits mission events.

```ts
type MissionEvent = {
  id: string;
  missionId: string;
  type: string;
  phase: MissionPhase;
  roleId?: string;
  taskId?: string;
  artifactId?: string;
  severity: "info" | "success" | "warning" | "error";
  title: string;
  summary: string;
  createdAt: string;
};
```

Frontend consumers:

- ActivityFeed appends event rows
- MissionTimeline updates phase state
- PixelOfficeScene updates room/sprite activity
- ArtifactDrawer shows new artifacts
- TopHud updates cost/risk/active agents

## 14. MVP Build Order

### Phase 0: Project Foundation

Goal: repo runs locally with UI shell and mock data.

Deliverables:

- Monorepo scaffold
- Web app shell
- Design tokens from `DESIGN.md`
- Mock mission data
- Mock role registry
- HQ layout
- Mission Control layout

### Phase 1: Pixel HQ With Mock Autopilot

Goal: make the product feel real before adding real external execution.

Deliverables:

- Pixel office map
- Department rooms
- Agent sprites
- Mission command input
- Mock mission lifecycle
- Event feed
- Artifact drawer
- Role inspector
- Phase timeline

### Phase 2: Real Mission Orchestrator

Goal: backend can create mission, assign roles, produce structured artifacts.

Deliverables:

- API service
- Database schema
- Mission state machine
- Role registry
- Worker jobs
- Agent run records
- Artifact persistence
- Audit events
- Realtime mission events

### Phase 3: Local Execution Tools

Goal: agents can inspect and modify a local workspace safely.

Deliverables:

- Tool runner abstraction
- File read/write tools
- Shell command tool with sandbox policy
- Test command runner
- Patch artifact generation
- QA report generation

### Phase 4: Git Integration

Goal: agents can work against a repository.

Deliverables:

- GitHub or GitLab integration
- Branch creation
- Commit generation
- PR creation
- CI status reading
- Code review summary

### Phase 5: Deployment And Operations

Goal: product becomes a full AI dev company.

Deliverables:

- Staging deploy adapter
- Deployment gate
- Smoke checks
- Rollback visibility
- SRE monitoring panel
- Release notes
- Customer-facing summary

## 15. First Screen Implementation Detail

Build **HQ + Mission Control split view** first.

### Layout

```txt
+--------------------------------------------------------------------------------+
| Top HUD: mission, phase, active agents, risk, cost, command palette             |
+----------+-----------------------------------------------------+---------------+
| Left Nav | Center: Pixel Office / Mission Workspace            | Inspector     |
|          |                                                     |               |
| HQ       | [Executive] [Product] [Design] [Engineering]        | Selected      |
| Missions | [QA Lab] [DevOps] [Ops] [Support]                  | mission/role  |
| Company  |                                                     | artifacts     |
| Artifacts|                                                     |               |
+----------+-----------------------------------------------------+---------------+
| Bottom: Mission Command Dock + Activity Feed                                   |
+--------------------------------------------------------------------------------+
```

### Required Components

1. `AppShell`
2. `TopHud`
3. `LeftNav`
4. `HQCommandRoom`
5. `PixelOfficeScene`
6. `DepartmentRoom`
7. `AgentSprite`
8. `MissionInspector`
9. `MissionTimeline`
10. `ActivityFeed`
11. `MissionCommandDock`
12. `ArtifactDrawer`

### Mock Scenario

Use one default mission:

```txt
"Build a sales analytics dashboard with filters, export CSV, tests, and staging deployment."
```

Mock roles active:

- CEO planning success criteria
- PM writing PRD
- Lead BA creating acceptance criteria
- Tech Lead reading architecture
- FE building dashboard
- BE checking API contract
- QA Automation writing tests
- Manual QA reviewing flow
- DevOps preparing staging deploy
- Technical Writer drafting final report

## 16. Role Output Contracts

Each role should produce structured output. This avoids vague AI text and makes UI/artifacts consistent.

### PM Output

```txt
product_goal
scope_in
scope_out
user_stories
acceptance_criteria
risks
open_questions
```

### Lead BA Output

```txt
business_process
business_rules
edge_cases
validation_rules
acceptance_matrix
```

### Tech Lead Output

```txt
implementation_plan
affected_files
architecture_notes
dependencies
risk_register
review_checklist
```

### FE Developer Output

```txt
components_created
routes_changed
state_management_notes
accessibility_notes
screenshots
```

### BE Developer Output

```txt
api_changes
schema_changes
service_changes
test_notes
compatibility_notes
```

### QA Output

```txt
test_plan
test_cases
automation_results
manual_results
defects
signoff_status
```

### DevOps Output

```txt
build_status
deployment_target
deployment_log
smoke_test_results
rollback_plan
release_status
```

## 17. Development Milestones

### Milestone A: Clickable Product Prototype

Time target: shortest possible.

Definition of done:

- User can open app
- See pixel HQ
- Type a mission
- Watch mock agents move through phases
- Inspect role tasks
- See generated mock artifacts
- See final report

### Milestone B: Real Mission Records

Definition of done:

- Mission saved in database
- Events stream from backend
- Artifacts saved
- State survives refresh
- Role registry loaded from code

### Milestone C: Real Agent Runs

Definition of done:

- One mission phase calls real agent runtime
- Output schema validated
- Artifact generated from agent output
- Audit event records input and output summary

### Milestone D: Local Code Task

Definition of done:

- User points to local repo
- AI reads files
- AI proposes patch
- Tool runner applies patch in sandbox
- Tests run
- QA report generated

### Milestone E: Git PR Autopilot

Definition of done:

- AI creates branch
- Applies patch
- Runs tests
- Opens PR
- Final report links to PR and test results

## 18. Risks To Design Around Early

| Risk | Mitigation |
|---|---|
| UI becomes cute but not useful | Keep logs, artifacts, task graph, and reports first-class |
| Agent output becomes vague | Require role output schemas |
| Autopilot feels unsafe | Add policy, audit events, kill switch, cost ceiling |
| Pixel scene drifts from real state | Pixel engine consumes backend state only |
| Too many roles create noise | Show active roles by phase, keep full org chart separate |
| Long missions lose context | Persist artifacts, summaries, decisions, memory items |
| External tools fail | Model all tool failures as audit events and blockers |
| Costs become unclear | Track cost per mission, phase, role, and tool call |

## 19. Immediate Next Step

Before scaffolding the frontend, implement the accuracy foundation described in [ACCURACY_AND_ROLE_SKILL_PLAN.md](./ACCURACY_AND_ROLE_SKILL_PLAN.md). The first UI should consume real role, skill, quality-gate, and verification contracts instead of hard-coded decorative mock data.

Then start by scaffolding the frontend and mock-state MVP:

1. Create web app
2. Add design tokens
3. Build `AppShell`
4. Build `HQCommandRoom`
5. Build `PixelOfficeScene` with mock rooms
6. Build `MissionCommandDock`
7. Build `ActivityFeed`
8. Build `MissionInspector`
9. Simulate mission lifecycle with local mock events

This proves the core product experience before adding real agent execution.
