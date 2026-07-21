# Release smoke test

The release smoke test verifies the live WordPress path without publishing public content. It runs a full private sync, creates one clearly labeled WordPress **draft**, checks the private operation-key lookup, submits the same draft again to prove it updates rather than duplicates, and finishes with another full private sync.

It creates a local Foundry article and leaves the corresponding WordPress draft in place for audit. The title starts with `Foundry Release Smoke Draft`; remove it manually from WordPress only after recording the result.

Run it only with intentionally configured production credentials:

```powershell
$env:FOUNDRY_RELEASE_SMOKE_CONFIRM = "publish-draft"
npm run release:smoke
Remove-Item Env:FOUNDRY_RELEASE_SMOKE_CONFIRM
```

The command refuses to contact WordPress unless the confirmation value is exactly `publish-draft`. It never requests the public publish mode, AI generation, or image generation.
