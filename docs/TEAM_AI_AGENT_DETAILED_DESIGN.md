# Team AI Agent Detailed Design

## 1. Product Concept

Team AI Agent is a web application where the user commands a full virtual software company. The user gives one mission, such as "build a customer portal", "fix this GitHub issue", "launch a landing page", or "analyze and improve our KPI module". The system then runs an autonomous company process: executives clarify the goal, product roles shape scope, design creates UI direction, engineering implements, QA verifies, DevOps deploys, and operations writes the final report.

The interface should feel like a pixel strategy game, but the product itself is a serious work tool. The user is not chatting with one assistant. The user is watching a company operate.

## 2. Core Promise

"สั่งงานครั้งเดียว แล้วบริษัท AI ทั้งทีมจัดการให้จนเสร็จ"

The product must make four things obvious:

1. Who is working.
2. What they are doing.
3. What artifact they produced.
4. Whether the result is ready, risky, failed, or shipped.

## 3. Primary User Flow

1. **Create Mission**: The user describes the desired outcome, chooses workspace/repo/integrations, and selects Autopilot.
2. **Executive Triage**: CEO, COO, CTO, CPO, and PM convert the brief into a mission charter, scope, risks, and delivery strategy.
3. **Discovery & Planning**: BA, Lead BA, UX Researcher, Solution Architect, and Tech Lead produce requirements, assumptions, data model, user stories, and task graph.
4. **Production**: FE, BE, Fullstack, AI Engineer, DB Engineer, and Integration Engineer implement work in parallel.
5. **Verification**: QA Lead, Manual QA, Automation Test, Security QA, and Performance QA verify behavior, create tests, and open defects if needed.
6. **Release**: DevOps, SRE, Release Manager, and Cloud Architect deploy, monitor, and roll back if necessary.
7. **Final Report**: Chief of Staff and Tech Writer summarize what changed, links to artifacts, tests, risks, costs, and next recommendations.

## 4. Information Architecture

### Main Navigation

- **HQ**: Pixel office overview, company state, active missions, department health.
- **Missions**: Mission list, task graph, timeline, artifacts, final reports.
- **Company**: Org chart, roles, permissions, agent memory, role prompts, capacity.
- **Departments**: Product, Design, Engineering, QA, DevOps, Operations, Support.
- **Artifacts**: Specs, user stories, designs, code patches, test reports, deployments, docs.
- **QA Lab**: Manual test runs, automation results, defect loops, screenshots, test coverage.
- **Deployments**: Environments, releases, rollback history, monitoring, incidents.
- **Knowledge Base**: Company memory, project docs, previous decisions, reusable playbooks.
- **Integrations**: GitHub/GitLab, Jira/Linear, Slack, email, cloud providers, databases, CI/CD.
- **Settings**: Autopilot policy, cost limits, secrets, model routing, audit logs.

### Top HUD

- Current mission name and phase.
- Autopilot status.
- Active agents count.
- Token/API spend.
- Risk level.
- Environment target.
- Global command palette.

## 5. Main Screen: HQ Command Room

The first screen should be a functional game board:

- **Center**: Pixel/isometric company office map with rooms for Executive, Product, Design, Engineering, QA, DevOps, Operations, Support.
- **Left rail**: App navigation.
- **Right inspector**: Selected mission, selected role, selected artifact, or selected room.
- **Bottom event feed**: Real-time activity log with filters.
- **Command dock**: "สั่งงานบริษัท AI..." input with attachments and Autopilot mode.

Rooms animate only when work state changes. For example, Engineering desks light up during build, QA lab displays test rigs during verification, DevOps room shows release pipeline movement during deployment.

## 6. Role System

### Executive Layer

| Role | Responsibility | Key Outputs |
|---|---|---|
| CEO Agent | Owns mission outcome and final decision strategy | Mission charter, success criteria, executive summary |
| COO Agent | Coordinates departments and execution flow | Operating plan, handoff map, blockers |
| Chief of Staff Agent | Keeps context clean and writes status summaries | Daily-style report, final delivery report |
| CTO Agent | Owns technical direction and risk | Architecture decision, tech strategy, risk register |
| CPO Agent | Owns product outcome and user value | Product goal, scope tradeoffs, acceptance criteria |
| Engineering Director | Allocates engineering roles | Build plan, role assignment |

### Product & Analysis

| Role | Responsibility | Key Outputs |
|---|---|---|
| Product Manager | Converts goal into product scope | PRD, roadmap slice, prioritization |
| Project Manager | Tracks timeline, dependencies, execution | Timeline, task graph, status |
| Scrum Master | Keeps work moving and removes blockers | Sprint-like board, blocker log |
| Lead BA | Leads business analysis | Business rules, workflow model |
| Business Analyst | Writes requirements and acceptance criteria | User stories, edge cases, requirements |
| UX Researcher | Infers user needs and validates assumptions | Personas, journey, usability risks |
| Data Analyst | Reviews metrics and data needs | Event taxonomy, reporting needs |

### Design

| Role | Responsibility | Key Outputs |
|---|---|---|
| Product Designer | Shapes workflows and screens | Flow map, wireframes, interaction model |
| UI Designer | Creates visual direction | Screen design, UI states |
| Design System Designer | Keeps components consistent | Tokens, component rules |
| UX Writer | Writes labels, empty states, errors | UX copy, notification copy |

### Engineering

| Role | Responsibility | Key Outputs |
|---|---|---|
| Solution Architect | Defines system shape | Architecture diagram, service boundaries |
| Tech Lead | Turns architecture into implementation plan | Technical plan, code review notes |
| Fullstack Developer | Implements cross-layer features | End-to-end code changes |
| Frontend Developer | Builds UI and interactions | Components, pages, client state |
| Backend Developer | Builds APIs and services | Handlers, services, DB integration |
| Database Engineer | Designs storage and migrations | Schema, indexes, migrations |
| AI/ML Engineer | Builds AI workflows | Prompts, evals, model routing |
| Prompt Engineer | Improves role prompts and task instructions | Prompt templates, tool-use rules |
| Integration Engineer | Connects external services | API adapters, webhooks |
| Mobile Developer | Optional mobile surfaces | Mobile UI or responsive behavior |

### QA & Verification

| Role | Responsibility | Key Outputs |
|---|---|---|
| QA Lead | Owns verification strategy | Test plan, quality gates |
| Manual QA | Explores behavior manually | Test notes, reproduction steps |
| Automation Test Engineer | Writes automated tests | Unit, integration, E2E tests |
| Security QA | Reviews auth, secrets, injection risk | Security checklist, findings |
| Performance QA | Checks speed and load risks | Performance report, bottlenecks |
| Accessibility QA | Checks inclusive behavior | A11y report, WCAG notes |

### DevOps & Reliability

| Role | Responsibility | Key Outputs |
|---|---|---|
| DevOps Lead | Owns build/release flow | CI/CD plan, pipeline status |
| SRE Agent | Monitors reliability | Health checks, incident notes |
| Cloud Architect | Maps infrastructure | Cloud config, environment plan |
| Release Manager | Ships or rolls back | Release notes, deployment record |
| Security Engineer | Hardens runtime and permissions | Secrets policy, access review |

### Company Operations

| Role | Responsibility | Key Outputs |
|---|---|---|
| HR Manager | Allocates agent capacity and role fit | Staffing plan, role availability |
| Finance Manager | Controls API cost and budget | Cost report, budget alerts |
| Legal/Compliance Agent | Checks policy and compliance risk | Compliance notes, data concerns |
| Customer Success Agent | Converts output into customer-facing notes | Support docs, release announcement |
| Technical Writer | Writes final documentation | README, changelog, handoff docs |
| Knowledge Manager | Saves durable memory | Decisions, playbooks, reusable context |

## 7. Autopilot Model

Autopilot is the default mode. The AI company proceeds without asking for approval on every step. The system still needs configured permissions for external actions such as repository writes, deployments, cloud changes, or paid APIs.

### Autopilot Controls

- **Full Autopilot**: Plan, implement, test, deploy, and report.
- **No Deploy Autopilot**: Everything except production deployment.
- **Draft PR Autopilot**: Implement and open PR, no merge.
- **Simulation Mode**: Run planning and estimates without external writes.

### Safety Design

Even in full autonomy, the UI should provide:

- Kill switch.
- Cost ceiling.
- Environment allowlist.
- Secret vault, never visible in logs.
- Tool-call audit trail.
- Rollback path for deployment tasks.
- Red-team/security review before high-risk release.

## 8. Mission Lifecycle States

| State | Visual | Meaning |
|---|---|---|
| Intake | Command input glows cobalt | User brief is being parsed |
| Planning | Amber room activity | Product/BA/Architecture are shaping work |
| Assigned | Role avatars move to rooms | Tasks are distributed |
| Building | Engineering room active | Code/content/config is being produced |
| Testing | QA lab active | Manual and automated checks running |
| Fixing | Defect loop visible | Bugs found and routed back to owners |
| Deploying | DevOps pipeline active | Release process running |
| Monitoring | SRE console active | Post-release checks running |
| Complete | Green delivery seal | Final report and artifacts ready |
| Needs Setup | Red/amber gate | Missing permissions, integration, or required secret |

## 9. Key Screens

### HQ

Purpose: Let the user understand the whole AI company at a glance.

Core elements:
- Pixel office map.
- Active missions.
- Department health.
- Recent artifacts.
- Cost and risk summary.
- Global command input.

### Mission Control

Purpose: Let the user inspect one mission from brief to final report.

Core elements:
- Mission charter.
- Phase timeline.
- Role assignments.
- Task graph.
- Artifact list.
- Event trace.
- QA and deployment gates.
- Final report.

### Org Chart

Purpose: Make the AI company understandable and configurable.

Core elements:
- Executive-to-staff hierarchy.
- Role descriptions.
- Current load.
- Specializations.
- Tool permissions.
- Prompt/version history.

### Department Room

Purpose: Show detailed work by department.

Examples:
- Product room: PRD, stories, acceptance criteria.
- Design room: flows, states, UX copy.
- Engineering room: branches, commits, files changed, code review.
- QA room: test matrix, failures, screenshots.
- DevOps room: builds, environments, deploy status.

### Artifact Hub

Purpose: Keep every output in one place.

Artifact types:
- Mission charter.
- PRD.
- User stories.
- Technical design.
- UI design notes.
- Code diff.
- Test results.
- Deployment logs.
- Release notes.
- Final report.

### Audit Trace

Purpose: Build trust in autonomous execution.

Core elements:
- Every role decision.
- Every tool call.
- Inputs and outputs.
- Cost per step.
- Model used.
- Failure/retry history.
- Links to generated artifacts.

## 10. Visual Direction

### Pixel Art Style

- Top-down or isometric 2D company building.
- Departments as rooms, not decorative cards.
- Agents as small readable sprites with role color accents.
- Animations are short loops: typing, reviewing, testing, deploying, meeting, debugging.
- Work items can move like small packages through departments.
- Avoid childish proportions, excessive cuteness, and cartoon clutter.

### UI Shell

- Light shell for readability.
- Dark tactical canvas for the company map.
- Crisp borders, 4px to 8px radii, minimal shadow.
- Compact panels with strong hierarchy.
- Icons for tools and actions.
- No giant marketing hero.

## 11. Component Inventory

1. **Mission Command Input**: Natural-language task input with attachments, repo selector, environment selector, autonomy mode.
2. **Agent Role Card**: Avatar, role, current task, state, confidence, cost, artifacts.
3. **Department Room Tile**: Pixel room, queue count, load, health, active roles.
4. **Mission Timeline**: Phase progression from planning to deployment.
5. **Task Graph**: Dependencies and ownership between roles.
6. **Artifact Drawer**: Generated files, reports, designs, tests, and diffs.
7. **Event Feed**: Real-time trace of autonomous actions.
8. **QA Gate Panel**: Test matrix, pass/fail, retry loops, manual findings.
9. **Deployment Gate Panel**: Build, deploy, smoke test, monitor, rollback.
10. **Cost & Risk HUD**: Token spend, API cost, time, risk score.
11. **Command Palette**: Search missions, agents, artifacts, and actions.
12. **Kill Switch**: Always reachable when a mission is running.

## 12. Technical Architecture

### Frontend

- React or Next.js app.
- Canvas/WebGL or DOM grid for the pixel office map.
- Real-time updates via WebSocket or Server-Sent Events.
- State model for missions, agents, rooms, artifacts, logs.
- Accessible HTML panels around the game canvas.

### Backend

- Orchestrator service owns mission lifecycle and role assignment.
- Workflow engine such as Temporal, Inngest, or durable queues.
- Tool runner service executes code, shell, browser, Git, CI/CD, deploy, and document tasks.
- Agent role registry stores prompts, permissions, models, tools, and output schemas.
- Artifact store saves specs, diffs, reports, logs, screenshots, and deployments.
- Audit log stores every decision and tool call.

### AI Layer

- Role-specific agents.
- Shared company memory.
- Mission memory.
- Retrieval over project docs and previous decisions.
- Structured output for plans, tasks, test reports, and final reports.
- Evaluator/verifier agents for QA, security, and acceptance criteria.

### Data Model

- `Workspace`
- `Mission`
- `MissionPhase`
- `AgentRole`
- `AgentRun`
- `Task`
- `Artifact`
- `ToolCall`
- `QAReport`
- `Deployment`
- `Incident`
- `MemoryItem`
- `Integration`
- `CostRecord`
- `AuditEvent`

## 13. MVP Scope

### MVP 1: Commandable AI Company

- HQ screen with pixel office map.
- Mission command input.
- Role roster and org chart.
- Mission Control with timeline, activity feed, and artifacts.
- Core roles: CEO, PM, BA, Tech Lead, FE, BE, QA, DevOps, Technical Writer.
- Autopilot mission execution in simulation or local workspace mode.

### MVP 2: Real Development Execution

- GitHub/GitLab integration.
- Codebase reading.
- Branch/PR creation.
- Test execution.
- QA report generation.
- Final delivery report.

### MVP 3: Full Company Automation

- Deployment integrations.
- Cost control.
- Security/compliance roles.
- Multi-mission queue.
- Agent capacity/HR layer.
- Knowledge base memory.
- Department analytics.

## 14. Non-Negotiable Quality Rules

- No black-box automation.
- No role without a real responsibility.
- No animation without state meaning.
- No pixel font for core UI.
- No hidden costs or untraceable tool calls.
- No deployment without rollback visibility.
- No artifact loss: every output must be saved and searchable.

## 15. Example Mission

User input:

> "สร้างหน้า dashboard สำหรับดูยอดขายรายวัน เชื่อมกับ API เดิม มีกราฟ ตาราง filter export CSV และ deploy staging ให้เลย"

Autonomous flow:

1. CEO defines success criteria.
2. PM scopes dashboard requirements.
3. BA writes user stories and edge cases.
4. Product Designer defines layout and states.
5. Tech Lead reads repo and chooses implementation path.
6. FE builds dashboard UI.
7. BE adjusts API or adapter if needed.
8. QA Automation writes tests.
9. Manual QA checks filters/export behavior.
10. DevOps deploys staging.
11. SRE runs smoke checks.
12. Technical Writer produces final notes.
13. Chief of Staff returns final report with links.

## 16. Suggested First Build Screen

Start with **HQ + Mission Control split view**:

- Left rail navigation.
- Top HUD.
- Center pixel office map.
- Right selected mission inspector.
- Bottom event feed.
- Command dock.

This gives the product its identity immediately while proving the serious execution model.
