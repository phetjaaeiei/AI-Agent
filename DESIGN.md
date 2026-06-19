<!-- SEED: re-run $impeccable document once there is production code to capture the actual tokens and components. -->
---
name: Team AI Agent
description: Autonomous AI company interface with a pixel strategy-game work surface.
colors:
  bg: "oklch(0.985 0.000 0)"
  surface: "oklch(0.955 0.004 230)"
  canvas-ink: "oklch(0.155 0.014 250)"
  ink: "oklch(0.180 0.012 250)"
  muted: "oklch(0.420 0.018 250)"
  border: "oklch(0.860 0.006 230)"
  primary: "oklch(0.620 0.120 230)"
  accent-amber: "oklch(0.780 0.140 72)"
  success: "oklch(0.660 0.130 155)"
  danger: "oklch(0.580 0.180 25)"
typography:
  body:
    fontFamily: "Noto Sans Thai, Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  title:
    fontFamily: "Noto Sans Thai, Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.3
  label:
    fontFamily: "Noto Sans Thai, Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 650
    lineHeight: 1.2
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.45
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.bg}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
  mission-panel:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: Team AI Agent

## 1. Overview

**Creative North Star: "Pixel War Room"**

The product is a work command center wrapped around a pixel strategy-game office. The user should feel they are managing a living AI development company, but every playful layer must clarify ownership, progress, risk, and output. The core shell is legible, restrained, and tool-like; the central canvas carries the game identity.

The visual system rejects generic chatbot screens, bland SaaS dashboards, toy-like idle games, purple-gradient AI branding, and unreadable pixel fonts. Pixel art belongs in avatars, rooms, scene tiles, activity states, and mission events. Production UI text, logs, diffs, forms, and reports stay crisp and readable.

**Key Characteristics:**
- Light productivity shell with a dark tactical pixel canvas.
- Cobalt primary actions, amber planning states, green success, red risk.
- Compact panels, 8px radius by default, clear borders over heavy shadows.
- Motion communicates state: assigning, coding, testing, deploying, blocked, done.
- Thai and English text must both remain readable in dense operational views.

## 2. Colors

The palette uses a restrained product shell with a stronger game canvas in the center. Cobalt is the command color; amber, green, and red are semantic status colors rather than decoration.

### Primary
- **Command Cobalt**: Used for primary actions, active navigation, selected agents, and current mission focus.

### Secondary
- **Planning Amber**: Used for analysis, waiting, review, planning, and queued work states.
- **Build Green**: Used for passing tests, completed tasks, healthy deployments, and verified artifacts.
- **Risk Red**: Used for failed tests, security warnings, deployment failures, and budget or permission risk.

### Neutral
- **Worktable White**: Main app background for long reading and planning.
- **Tactical Ink**: Central game canvas background and high-contrast HUD surfaces.
- **Cool Surface**: Sidebars, panels, empty states, and low-emphasis regions.
- **Muted Ink**: Secondary text, timestamps, metadata, and helper labels.

### Named Rules
**The Game-In-The-Middle Rule.** The shell stays calm and readable; the pixel strategy identity concentrates in the mission canvas and character activity.

**The Status-Is-Semantic Rule.** Amber, green, and red only mean work state. Never use them as random decoration.

## 3. Typography

**Display Font:** Noto Sans Thai / Inter  
**Body Font:** Noto Sans Thai / Inter  
**Label/Mono Font:** JetBrains Mono for logs, tool calls, diffs, run IDs, and terminal output

**Character:** The product uses serious software typography. Pixel feeling comes from art direction, tile grids, sprites, and HUD framing, not from unreadable body fonts.

### Hierarchy
- **Headline** (700, 24px, 1.25): Page titles, mission names, major workspace labels.
- **Title** (700, 20px, 1.3): Panel headings and room names.
- **Body** (400, 16px, 1.55): Briefs, reports, generated docs, summaries, and chat-like mission notes.
- **Dense Body** (400, 14px, 1.45): Tables, activity feeds, side inspectors, issue lists.
- **Label** (650, 12px, 1.2): Buttons, tabs, chips, state labels, agent stat labels.
- **Mono** (500, 12px, 1.45): Logs, traces, code paths, command output.

### Named Rules
**The No Pixel Text Rule.** Pixel fonts are forbidden for functional UI text. Use pixel art for atmosphere and standard sans/mono for work.

## 4. Elevation

The interface is flat by default, using borders, tonal layers, and small inset highlights to feel tactile. Shadows are reserved for popovers, dragged mission cards, modals, and active inspector panels.

### Shadow Vocabulary
- **Active Lift** (`0 8px 20px rgba(15, 23, 42, 0.12)`): Dragging a mission card or opening a focused inspector.
- **Popover Lift** (`0 12px 28px rgba(15, 23, 42, 0.18)`): Menus, command palette, and floating detail panels.

### Named Rules
**The Flat Office Rule.** Regular panels do not float. They sit on the worktable and separate through borders, spacing, and state.

## 5. Components

### Buttons
- **Shape:** Crisp utility shape (4px radius).
- **Primary:** Command Cobalt fill with white text, compact height, icon when action is tool-like.
- **Hover / Focus:** Slight tonal shift, 2px focus ring, no decorative glow.
- **Secondary:** White or cool-surface background with border and ink text.

### Mission Command Input
- **Style:** Large multiline input docked at the bottom or top of Mission Control.
- **Behavior:** Accepts natural-language goals, attachments, links, repository targets, environment selection, and autonomy mode.
- **States:** Draft, analyzing, mission created, missing integration, running, completed.

### Agent Avatar
- **Style:** Pixel sprite plus readable role label and state chip.
- **Behavior:** Clicking opens role duties, current task, artifacts produced, logs, confidence, and cost.
- **States:** Idle, planning, building, testing, reviewing, deploying, blocked, done.

### Room / Department Tile
- **Style:** Isometric or top-down pixel office room with animated workstations.
- **Behavior:** Shows department throughput, assigned tasks, queue, and health.
- **States:** Quiet, active, overloaded, blocked, incident, complete.

### Mission Card
- **Style:** Compact work item with owner role, phase, ETA confidence, risk score, artifacts, and next action.
- **Behavior:** Opens trace and artifact inspector.

### Activity Feed
- **Style:** Chronological event stream with role, action, tool, artifact link, and result.
- **Behavior:** Filters by role, phase, severity, and artifact type.

### Navigation
- **Style:** Left rail for core areas, top HUD for active mission, budget, running agents, environment, and global command palette.
- **Mobile:** Collapse to bottom tabs plus a full-screen mission canvas inspector.

## 6. Do's and Don'ts

### Do:
- **Do** make every autonomous action inspectable through role, room, task, artifact, and event log.
- **Do** keep pixel art in the canvas, avatars, rooms, and activity effects.
- **Do** use the same state colors everywhere: amber for planning, green for passed/complete, red for risk/failure.
- **Do** support dense team workflows with tables, logs, filters, diffs, and reports.
- **Do** provide reduced motion and text equivalents for every animated state.

### Don't:
- **Don't** build a generic chatbot interface.
- **Don't** make the app feel like a bland SaaS dashboard.
- **Don't** use toy-like idle game patterns that hide serious work.
- **Don't** use childish pixel art, unreadable pixel fonts, or purple-gradient AI branding.
- **Don't** make automation a black box.
