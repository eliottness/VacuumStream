# Contributing

Thanks for helping make Twitch easier to use from a sofa. Bug reports, controller testing,
documentation fixes, and code contributions are welcome.

## Start here

1. Read the [development guide](docs/contributing/development.md) to run the app and checks.
2. Review the [architecture](docs/contributing/architecture.md) before changing process or OAuth boundaries.
3. Follow the [design contract](docs/contributing/design.md) for interface changes.
4. Open an issue before a substantial feature or architecture change so we can agree on scope.

## Issues and pull requests

Use the [issue templates](https://github.com/eliottness/VacuumStream/issues/new/choose) for bugs
and feature requests. Include your version, distribution, installation method, and reproduction
steps. Describe whether you used native gamepad input or Steam Input keyboard mapping.

Fork the repository, branch from `main`, and keep each pull request focused. Explain the outcome
and how you tested it. Run `bun run verify`; add regression coverage when changing important
behavior. Update affected documentation and include screenshots for interface changes.
If a hardware or authenticated test is unavailable, say so rather than claiming it passed.

CI runs for pull requests and pushes to `main`. It verifies code, workflows, shell scripts,
desktop metadata, and unpacked Electron packaging. Release builds run separately.

## Conventions

- Use the existing TypeScript, React, Zod, and Biome patterns; keep privileged work in main.
- Preserve the four-arrow, Enter, Escape navigation contract. Text entry is the only exception.
- Keep Twitch's player unobscured and do not add private playback APIs or advertisement bypasses.
- Never commit tokens, device codes, Client Secrets, personal profiles, or private logs.
- The built-in public Client ID and localhost TLS fixture are intentional public data.
- Contributions use the project's [MIT license](LICENSE). Credit comes from Git authorship;
  there is no manually maintained contributor roster to keep in sync.

Be respectful and specific in discussions. Maintainer: [@eliottness](https://github.com/eliottness).
Report vulnerabilities privately using [SECURITY.md](SECURITY.md), not public issues.
