# npm Publish Instructions

**Status**: Package compiled and ready. Just needs npm authentication.

---

## Step 1: Authenticate to npm

```bash
npm login
```

Enter:
- Username: your npm account username
- Password: your npm account password  
- Email: associated email
- 2FA code: if 2FA is enabled

---

## Step 2: Publish Package

```bash
cd /Users/tylermiller/dev/ez-path/plugin-ezpath-fixed
npm publish --access public
```

This publishes `@ezpath/plugin-ezpath` to the npm registry.

---

## Step 3: Verify Publication

```bash
npm view @ezpath/plugin-ezpath
```

Should show:
- Package name: `@ezpath/plugin-ezpath`
- Version: `1.0.0`
- Latest published 2 minutes ago

---

## Step 4: Update Documentation

Update your README to include:

```markdown
## Installation

```bash
npm install @ezpath/plugin-ezpath
```

For Eliza agents:

```typescript
import ezpathPlugin from '@ezpath/plugin-ezpath';

const agent = new Agent({
  plugins: [ezpathPlugin],
  // ... config
});
```

## Configuration

Set environment variables:
- `EZPATH_WALLET_PRIVATE_KEY` — Base wallet with USDC
- `EZPATH_TIER` — `basic` (default), `resilient`, or `institutional`
```

---

## Step 5: Distribute Package

Share npm package URL:
```
https://www.npmjs.com/package/@ezpath/plugin-ezpath
```

---

## That's It

Once published, any node project can install via:
```bash
npm install @ezpath/plugin-ezpath
```

First live transaction through plugin triggers Agentic.Market auto-discovery.

---

## If Something Goes Wrong

**Package already published?**
```bash
npm publish --access public  # Just bumps version
```

Update version in `plugin-ezpath-fixed/package.json` if needed.

**Need to unpublish (rare)?**
```bash
npm unpublish @ezpath/plugin-ezpath@1.0.0 --force
```

Only use within 24 hours of original publish.

---

**Ready. Run `npm login` + `npm publish --access public` when authentication is set up.**
