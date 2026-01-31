# Decisions (0004-fix-pm-agent-stepcountis-and-sync-hal-submodule)

## Use maxSteps instead of stepCountIs

- The installed `ai` package (^4.3.0) does not export `stepCountIs`, causing a runtime import error when HAL loads the PM agent.
- The ticket and AI SDK docs indicate `maxSteps` is the supported way to limit the tool-calling loop in `generateText`.
- Replaced `stopWhen: stepCountIs(MAX_TOOL_ITERATIONS)` with `maxSteps: MAX_TOOL_ITERATIONS` so the same cap (10 steps) is enforced without depending on a missing export.

## No API or dependency changes

- No upgrade of the `ai` package was required; the existing version supports `maxSteps`.
- No changes to HAL app code other than updating the submodule pointer so HAL uses the fixed hal-agents code.
