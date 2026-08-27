# Workspace Instructions

## Secret-file policy

Never open, read, search, print, summarize, or modify the contents of secret or credential files, including:

- `.env`
- `.env.*`
- `*.pem`
- `*.key`
- Credential files and local secret stores

Do not include secret values in tool commands, logs, screenshots, or responses. When configuration must be checked, inspect only filenames, variable names, or redacted values. Ask the user to perform any action that requires viewing or entering a secret.

This policy is behavioral guidance. Keep secrets outside the workspace or use filesystem permissions for stronger protection.
