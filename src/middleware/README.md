# Backend middleware

Target home for cross-cutting request controls:

- authentication and token verification;
- authorization and ownership checks;
- request schema validation;
- rate limiting by route and identity;
- centralized error handling;
- security headers and CORS policy;
- request correlation and safe audit logging.

Middleware must fail closed for protected routes. Never trust user IDs, roles,
XP totals, lesson completion or certificate eligibility supplied by the client.
