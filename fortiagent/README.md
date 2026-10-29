# FortiAgent package

The repository owns the shared skill. Do not edit a generated package.
The adapter in `runtime.md` holds FortiAgent-specific instructions.

Run these commands from the repository root:

```sh
node scripts/helpers.test.cjs
node tools/build-fortiagent.cjs
node tools/check-package.cjs
```

The build creates `dist/forticnapp-lacework.tar.gz` for import.
It records the version, Git commit, dirty state and input hashes in `dist/fortiagent-build.json`.
Build from a clean committed tree for a release. Record the marketplace revision with the commit.
The local policy scanner is a replica. FortiAgent's submission check is the final authority.
Review and test the package in FortiAgent before submitting an update.
