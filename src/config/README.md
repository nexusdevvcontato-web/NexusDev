# Backend configuration

Centralize environment parsing and startup validation here.

Requirements:

- Fail startup when required secrets or database configuration are missing.
- Never provide a default or hard-coded JWT signing secret.
- Validate allowed origins from an explicit environment allowlist.
- Keep secrets out of logs, error responses and repository files.
- Separate development, test and production configuration.
- Validate configuration once at startup and expose an immutable configuration object.

Do not import configuration directly from arbitrary route handlers.
