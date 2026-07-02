# ETHOS Reproducible Builds

ETHOS publishes release receipts so anyone can rebuild the public web app from
source and compare the output with the deployed release.

Source is published at https://github.com/aitherapp/ethos-core. Public users
can inspect the release manifest and SHA-256 sums, run the build from source,
compare hashes, and verify GitHub artifact attestations for deployed releases.

The release manifest plus SHA-256 hash comparison is the primary verification
path. GitHub artifact attestations add signed CI provenance for the same
release files.

## What To Verify

Each public release should include:

- `trust/release-manifest.json`
- `trust/SHA256SUMS`
- A GitHub artifact attestation for the release files, linked from
  `release-manifest.json` under `provenance.githubArtifactAttestation`

The release manifest records the source revision, GitHub Actions run metadata,
Node.js version, npm version, lockfile hash, app artifact hashes, and the
attestation URL when CI publishes one.

`SHA256SUMS` records deterministic hashes for files in the built app. The
generated receipt files are excluded from the app hash set because they include
release metadata that can differ between the official build and a local rebuild.

## Verification Steps

From a clean checkout of the source revision named in
`trust/release-manifest.json`:

```bash
npm ci
npm run lint
npm test
npm run build:release
```

Then compare the generated local app hashes with the public release hashes:

```bash
diff -u dist/trust/SHA256SUMS path/to/public-release/trust/SHA256SUMS
```

If the app artifact hashes match, the local source rebuild produced the same
public app files as the release receipt.

## GitHub Artifact Attestations

Each production deploy from the public `ethos-core` repository creates a signed
SLSA build provenance attestation for the files listed in `trust/SHA256SUMS`.
The attestation is stored by GitHub and linked from
`trust/release-manifest.json`.

To verify a deployed release with the GitHub CLI, download or clone the public
app files, `cd` to the app root (the directory that contains `trust/SHA256SUMS`),
then verify each release file listed in the checksum receipt:

```bash
while read -r digest file; do
  gh attestation verify "$file" --repo aitherapp/ethos-core
done < trust/SHA256SUMS
```

You can also open the attestation URL recorded in `release-manifest.json` to
inspect the workflow run, repository, and commit that produced the release.

GitHub artifact attestations prove that GitHub Actions produced the named build
artifacts from a specific workflow run and repository context. They are useful
release provenance, but they are not the same thing as a maintainer GPG
signature or an independent security audit.

Use attestations to answer:

- Which workflow produced this artifact?
- Which source revision was used?
- Was the artifact produced by GitHub Actions for the expected repository?

Do not use attestations to claim:

- A human maintainer personally reviewed every file in the release.
- The implementation is independently audited.
- The source repository cannot be compromised.

## If Hashes Do Not Match

If a rebuild does not match the public hashes:

1. Confirm the exact source revision from `release-manifest.json`.
2. Confirm Node.js and npm versions.
3. Run `npm ci`, not `npm install`.
4. Rebuild from a clean checkout.
5. Compare the differing file paths in `SHA256SUMS`.

If the mismatch remains, treat it as a release integrity issue and report it
publicly. ETHOS should either explain the difference or publish a corrected
release receipt.
