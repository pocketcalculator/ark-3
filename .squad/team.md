# Squad Team

> ark-3

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Morpheus | Lead / Systems Architect | .squad/agents/morpheus/charter.md | 🏗️ Lead |
| Trinity | Embedded Engineer | .squad/agents/trinity/charter.md | 🔌 Embedded |
| Tank | AI/OCR Engineer | .squad/agents/tank/charter.md | 🧠 AI |
| Neo | Azure/Node.js Engineer | .squad/agents/neo/charter.md | ☁️ Cloud |
| Switch | Security & QA Engineer | .squad/agents/switch/charter.md | 🔒 Security |
| Scribe | Session Logger | .squad/agents/scribe/charter.md | 📋 Scribe |
| Ralph | Work Monitor | .squad/agents/ralph/charter.md | 🔄 Monitor |
| Rai | RAI Reviewer | .squad/agents/Rai/charter.md | 🛡️ RAI |
| Fact Checker | Fact Checker | .squad/agents/fact-checker/charter.md | 🔍 Verifier |

## Coding Agent

<!-- copilot-auto-assign: false -->

| Name | Role | Charter | Status |
|------|------|---------|--------|
| @copilot | Coding Agent | — | 🤖 Coding Agent |

### Capabilities

**🟢 Good fit — auto-route when enabled:**
- Bug fixes with clear reproduction steps
- Test coverage (adding missing tests, fixing flaky tests)
- Lint/format fixes and code style cleanup
- Dependency updates and version bumps
- Small isolated features with clear specs
- Boilerplate/scaffolding generation
- Documentation fixes and README updates

**🟡 Needs review — route to @copilot but flag for squad member PR review:**
- Medium features with clear specs and acceptance criteria
- Refactoring with existing test coverage
- API endpoint additions following established patterns
- Migration scripts with well-defined schemas

**🔴 Not suitable — route to squad member instead:**
- Architecture decisions and system design
- Multi-system integration requiring coordination
- Ambiguous requirements needing clarification
- Security-critical changes (auth, encryption, access control)
- Performance-critical paths requiring benchmarking
- Changes requiring cross-team discussion

## Project Context

- **Project:** ark-3
- **Created:** 2026-08-13
- **Requested by:** Paul Sczurek
- **Goal:** Portable camera device captures text, extracts a resource name with AI/OCR, and initiates a guarded Azure resource deletion workflow.
- **Preferred stack:** Node.js/TypeScript; Python is acceptable where device or vision tooling is materially better. No .NET or PowerShell.
