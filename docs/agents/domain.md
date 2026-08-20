# Domain Docs

How engineering skills consume this repository's domain documentation.

## Before exploring, read these

- `CONTEXT.md` at the repository root; or
- `CONTEXT-MAP.md` at the repository root if it exists, then each relevant context document it names; and
- ADRs in `docs/adr/` that affect the area being changed.

If these files do not exist, proceed silently. The domain-modeling workflow creates them when terminology or a durable decision is resolved.

## File structure

This is a single-context repository:

```
/
|- CONTEXT.md
|- docs/
|  `- adr/
`- src/
```

## Vocabulary and ADRs

Use the terms defined in `CONTEXT.md` for issue titles, tests, code, and documentation. Record a real missing term for domain modeling rather than silently inventing a synonym.

Surface a conflict with an existing ADR explicitly; do not silently override it.
