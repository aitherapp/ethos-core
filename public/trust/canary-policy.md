# ETHOS Canary Policy

ETHOS publishes a warrant canary so users have a simple, recurring privacy
signal to check. The canary lives at `/trust/canary.txt` in the public web
app release.

## What The Canary Says

The canary states, as of a specific date, that ETHOS has not been compelled
to add a backdoor, disclose encryption keys, weaken privacy, ship a targeted
malicious build, or hide a privacy compromise.

## Update Schedule

The canary is updated weekly. Each update should change the statement date
and the expected next update date.

If the canary is late, missing, rewritten in a materially weaker way, or
removed without a clear public explanation, users should treat that as a
reason to pause before relying on a new ETHOS release.

## How It Is Published

The canary is included in the same public build output as the app. Release
builds publish:

- `trust/canary.txt`
- `trust/release-manifest.json`
- `trust/SHA256SUMS`

The canary is tied to the public release provenance through its SHA-256 hash
in `SHA256SUMS` and `release-manifest.json`.

## How To Verify

1. Open `/trust/canary.txt`, `/trust/SHA256SUMS`, and
   `/trust/release-manifest.json` from the same public ETHOS release.
2. Find the `trust/canary.txt` entry in `SHA256SUMS`.
3. Compute the SHA-256 hash of `canary.txt` and compare it to that entry.
4. Confirm the statement date and expected next update date are current.

If the hash does not match, or the canary is late or materially weaker than
before, treat that as a reason to pause before relying on a new ETHOS release.

## Limits

A canary cannot prove that no compromise is possible. It also cannot protect
against a compromised maintainer machine, compromised GitHub account,
compromised CI runner, browser compromise, or legal rules that differ by
jurisdiction.

The canary is one trust anchor. It should be checked together with the
cryptographic design note, release receipts, public app behavior, and the
public source code on GitHub used to build the app.
