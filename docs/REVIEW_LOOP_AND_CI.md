# Review Loop And Local CI

Phase 5 connects mission artifacts, local tools, and local Git evidence into a review-ready handoff without remote mutation.

## Review Packet Flow

```txt
Mission evidence
  -> review packet
  -> completeness assessment
  -> local CI profile
  -> required role reviews
  -> offline delivery report
```

Each packet stores concrete artifact, tool-call, and Git-operation IDs. Refreshing a packet recomputes its state from persisted evidence rather than trusting browser state.

## Completeness Requirements

- changed files or local patch evidence;
- passing test evidence from the default local CI profile;
- completed Git status;
- completed Git diff;
- a ready commit plan;
- pass decisions from Tech Lead, QA Lead, and Lead BA.

Failed tests, blocked test commands, denied Git paths, failed Git operations, or a non-ready commit plan block delivery readiness. Missing evidence keeps a packet in draft. Reviewer revise and block decisions are preserved separately.

## Default Local CI

The profile runs through the existing tool-runner policy with `shell: false`:

1. `npm run typecheck`
2. `npm run verify:foundation`
3. `npm run verify:agent-runtime`
4. `npm run verify:tool-runner`
5. `npm run verify:git-runner`
6. `npm run verify:orchestrator`
7. `npm run build:web`

Stdout and stderr remain bounded tool evidence. The review packet references tool-call IDs and a summarized pass/fail matrix.

## REST Endpoints

- `GET /api/mission/review-packets?missionId=...`
- `POST /api/mission/review-packets`
- `GET /api/mission/review-packets/:packetId`
- `POST /api/mission/review-packets/:packetId/refresh`
- `POST /api/mission/review-packets/:packetId/ci`
- `POST /api/mission/review-packets/:packetId/reviews`
- `POST /api/mission/review-packets/:packetId/delivery`

Set `TEAM_AI_AGENT_REVIEW_PACKET_STORE_PATH` to override the default `.data/review-packets.json` store.

## Delivery Report

Delivery generation writes a Markdown artifact with summary, safe changed-file references, verification status, risks, rollback notes, and open review items. A blocked packet can produce a draft report, but it cannot become `delivered` until every completeness requirement passes.

## Safety Boundary

Phase 5 does not push branches, create remote pull requests, merge, deploy, read secrets, or run destructive Git reset/checkout commands. Delivery reports serialize summaries and evidence references, not raw secret-bearing command output.
