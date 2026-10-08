# letsgetbuilding

## Seeblick KYC Agent demo

`kyc-agent-demo.html` is a single-file sales demo of an agent crew doing KYC onboarding for a fictional Swiss private bank. Open it in a browser. There is nothing to install or build, and it makes no network calls apart from loading fonts.

Every person, document, watchlist entry and policy clause in it is synthetic.

### A five-minute run

1. **Run the crew on the queue.** Six applicants are triaged in parallel and sort themselves by severity. The scoreboard counts checks, flags and dismissed look-alike hits as they land.
2. **Oliver Sutter, the forgery.** Every field matches the application and the agent still escalates, because the bill date and address were edited after issue. Switch on *Forensic view* to see where.
3. **Jonas Weber, the loop.** The agent drafts a German message about the address typo. Send it, press *Simulate client reply*, and only three checks re-run before the verdict flips to CLEAR. Two look-alike PEP names in the screening were already dismissed, each with a written reason.
4. **Isabel Fontana, the PEP.** The client is the spouse of a sitting Deputy Minister and did not declare it. Source of wealth is reconciled to 96%, an EDD pack is prepared, and Approve is locked for a High-risk client.
5. **Crew & controls.** Shows the guardrail matrix and a business-case calculator. Then switch on *Straight-through* and run the queue again to show the policy dial.

Hover a flag, a comparison row or a screening hit to light up its evidence in the documents. *Show audit log (JSON)* exports the full case record.

### What is real and what is staged

| Real in the page | Staged for the demo |
|---|---|
| Passport MRZ check digits are computed (ICAO 9303) | The agent steps and their timings follow a script |
| Risk scores are summed from six visible factors | Documents, names, watchlists and articles are invented |
| Flags, notes, counters and the audit trail are derived from the case data | The 38 → 4 minute and 62% figures, and the calculator defaults, are illustrative |
| The decision rules (High risk locks Approve, overrides are logged) | The German and French drafts should be checked by a native speaker before a Swiss audience |

The page follows the Claude Artifact format (no `<html>` or `<body>` tags), so it can also be published as an artifact.
