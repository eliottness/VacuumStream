# Releases

Audience: maintainers with write access to `eliottness/VacuumStream`.
For local setup, see [development](../contributing/development.md).

## Identity and version source

- Owner: [Eliott Bouhana (@eliottness)](https://github.com/eliottness).
- Repository: `eliottness/VacuumStream`; default branch: `main`.
- Application ID: `io.github.eliottness.VacuumStream` in Electron, Flatpak, desktop, icon, and AppStream metadata.
- Version source: `package.json`. Release tags must be exactly `v` followed by that version.
- Keep the release version/date in `flatpak/io.github.eliottness.VacuumStream.metainfo.xml` current.
- Preserve contributors' Git authorship; do not replace historical authors with the project owner.

## Before publishing

1. Update `package.json` and AppStream release metadata together. Commit the version change.
2. Review [Twitch integration policy](twitch.md), dependency updates, and open security reports.
3. Run `bun install --frozen-lockfile` and `bun run verify`.
4. Test actual artifacts, including sign-in, playback, keyboard navigation, and target hardware
   where available. Document untested platforms in the release notes.
5. Merge to `main` and wait for CI. Do not publish known-broken builds.
6. Optionally run **Release artifacts → Run workflow** from the Actions tab on the intended ref.
   This builds downloadable workflow artifacts only; it does not create a release or upload assets.

## Publish a release

In GitHub's Releases page, draft a release with tag `vVERSION` targeting the tested commit.
Describe changes, installation instructions, and known limitations. Publish the release (or
prerelease) when ready. Merely pushing a tag or saving a draft does not start asset publishing.

The [release workflow](../../.github/workflows/release.yml) runs on `release: published`:

1. Checks out the tagged commit, installs locked dependencies, and runs verification.
2. Rejects a tag that differs from `v` + `package.json` version.
3. Builds Linux x86_64 AppImage and Flatpak assets in an isolated hosted build job.
4. Computes and verifies checksums, then retains a workflow artifact for 14 days.
5. A separate job with `contents: write` verifies the checksums again and uploads the files to
   the **existing** release. The build job and pull-request CI have read-only repository access.

Expected assets:

```text
VacuumStream-VERSION-x86_64.AppImage
VacuumStream-VERSION-x86_64.flatpak
SHA256SUMS
```

The GitHub-generated source archives remain available alongside these binaries. No npm publish,
Flathub submission, automatic version bump, or release creation occurs in the build scripts.
The release becomes visible before its assets finish building; wait for the workflow before announcing it.

## Verify and recover

Download assets from the release and run `sha256sum --check SHA256SUMS`. Launch the AppImage
and install/run the Flatpak using the [user guide](../users/getting-started.md).
Checksums are not signatures; do not describe the artifacts as signed.

If building fails, fix the cause before publishing another version. A transient failure can be
retried with GitHub's **Re-run failed jobs**. Uploading refuses to overwrite existing assets;
if an upload partially succeeded, inspect the assets and explicitly remove only the failed
attempt's assets before retrying the publish job. Never silently replace an announced binary.
Do not move a published version tag to different code; issue a new version instead.

Locally, `bun run package:release` builds the same files without uploading. Install the Flatpak
toolchain first. Use a clean `dist/release/` when collecting assets for a new version.
Set `RELEASE_TAG=vVERSION` to also exercise the tag/version guard.

## Distribution limitations

The Flatpak manifest packages `dist/linux-unpacked`, built from checked-out source with locked
dependencies. It is suitable for GitHub bundles, not a Flathub source-build submission.
A Flathub submission needs a fully checksummed source/dependency manifest, screenshots,
current runtime support, and review under Flathub's rules. Track runtime lifecycle and update the
manifest, build-container digest, and development documentation together.

The build container is privileged to allow Flatpak's nested sandbox on an ephemeral GitHub-hosted
runner. Do not move this workflow onto a shared self-hosted runner. No publishing token is supplied
to build commands. Changes to workflow privileges require maintainer review.
