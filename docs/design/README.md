# Phone Ops-Console — Design Direction

Three documents define the phone app before a line of code:

1. **[PHONE-OPS-CONSOLE-PLAN.md](../PHONE-OPS-CONSOLE-PLAN.md)** — what to build:
   stack, architecture, screens, phases, cost. The go/no-go brief.
2. **[APP-DESIGN-LANGUAGE.md](APP-DESIGN-LANGUAGE.md)** — how it should *behave*:
   the best interactions ever shipped (Flighty, Things 3, Apple Wallet, Linear),
   each mapped to our screens, plus the anti-pattern ban-list built from
   Microsoft's documented Power BI mobile failures.
3. **[IOS-CRAFT-SPEC.md](IOS-CRAFT-SPEC.md)** — how it should *feel*: the exact
   palette, type ramp, spring physics, haptic taxonomy, Live Activity layouts.
   Copy-pasteable values.

## The ethos in one line

A quiet instrument cluster: near-black, edge-to-edge, one number per screen,
sub-100ms response — built for the boring 95% (glance and go) and the
terrifying 5% (the 6 AM refresh failure), with Flighty as the bar to clear.

## One resolved conflict: the accent

The two research docs proposed different accents (Rosso red vs warm amber).
**Decision: warm amber (`#E8A33D`) is the app's single accent; red is never
chrome.** Rationale: this is a *monitoring* app — red must be reserved
exclusively for "broken" so a glance can never confuse jewelry with emergency.
The Luce interior read comes from the dark cabin + warm ambient glow, not from
painting the dashboard red. Where APP-DESIGN-LANGUAGE.md says "Rosso accent",
read "amber accent"; its interaction guidance is unaffected.

## Status

Research complete; no app code exists yet. Phase 1 (read-only fleet health,
no push backend) is the first buildable slice per the plan. The owner green-
lights phases; nothing is scheduled until then.
