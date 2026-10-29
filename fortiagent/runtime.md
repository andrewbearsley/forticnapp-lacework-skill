## FortiAgent runtime

Use bash for host commands. Use read, grep or glob for scratch files.
Every shell call requires separate user approval, including help and documentation reads.
Follow the runtime's identity and audit controls. Stop an operation if the user declines a call.

Make each shell call self-contained. Define its functions, variables, paths and request bodies in that call.
Resolve placeholders before execution. Add the verified profile, account and applicable subaccount to each live command.
Reduce the first live response before it enters the tool trace. Show identifiers only when the task needs them.
Keep raw scan results and diagnostics out of the conversation. Preserve failures and state pagination limits.
Use field-specific reads to check scope. Confirm their syntax and output with scoped help or official documentation.
If a safe scope check is unavailable, ask the user to confirm the scope in the CLI or console.

Load the relevant bundled references with the exact resource handles returned by the skill loader.
Materialise bundled helper scripts in private scratch space before execution if the loader returns resource handles.
Keep helper files together when running their fixture tests. Paths in examples are relative to the skill directory.

Default to read-only work. A scan, upload, installation or configuration change needs an explicit user request.
Explain the target and effects before the operation. Apply the normal runtime approval for each call.
A recommendation does not authorise execution. An analytical POST search can be read-only.
