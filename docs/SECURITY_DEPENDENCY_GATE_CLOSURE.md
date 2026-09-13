# Security dependency gate closure

Date: 2026-09-13

## Baseline

- Base: `origin/main` at `7729726f628f9f7c0949792ce74c30b05cb8f7ce`.
- Runtime: Node `v24.11.0`, npm `11.6.1`.
- Production audit before remediation: one high and five moderate findings.

| Advisory | Installed version | Dependency path | Fixed version / resolution |
| --- | --- | --- | --- |
| `sharp` GHSA-rgj7-g3m4-5g8c (high) | `0.35.2` | direct production dependency | `0.35.4` |
| `uuid` GHSA-w5hq-g745-h8pq (moderate) | `9.0.1` | `firebase-admin@14.3.0` optional `@google-cloud/storage@7.22.0` -> `teeny-request@9.0.0` -> `uuid@9.0.1` | parent update removes this path |

## Minimal remediation

- `sharp`: pin the compatible production range from `^0.35.2` to `^0.35.4`; lockfile resolves `0.35.4`.
- `firebase-admin`: pin from `^14.1.0` to `^14.4.0`; this is compatible with the project's Node 24 contract and upgrades optional Google Cloud dependencies. The resolved `@google-cloud/storage` becomes `8.1.0`, which removes the former `teeny-request@9` path.

No override, forced audit fix, major version change, application-code change, legal-corpus change, or production mutation was made.

## Remaining moderate advisory

`npm audit --omit=dev` reports two moderate entries describing the same remaining path:

`firebase-admin@14.4.0` optional `@google-cloud/storage@8.1.0` -> `gaxios@6.7.1` -> `uuid@9.0.1`.

The current `@google-cloud/storage@8.1.0` requires `gaxios@^6.0.2`; the latest 6.x release is `6.7.1`, while the advisory is fixed only outside that major line (`uuid >=11.1.1` is not compatible with gaxios 6). An override would violate the parent's declared range, so it is intentionally not used. The CI policy audits at `--audit-level=high`; the high and critical counts are zero after remediation.

## Required evidence after remediation

- `npm ci`: PASS.
- `npm ls sharp firebase-admin @google-cloud/storage teeny-request uuid`: resolves `sharp@0.35.4`, `firebase-admin@14.4.0`, `@google-cloud/storage@8.1.0`; no `teeny-request@9` path remains.
- `npm audit --omit=dev --audit-level=high`: PASS (zero high/critical).
- Full validation results are recorded in the PR after this change.
