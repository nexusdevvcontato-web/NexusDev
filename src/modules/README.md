# Backend domain modules

Planned domain areas:

- `auth/` — registration, login, session and account linking.
- `users/` — profile and account lifecycle.
- `curriculum/` — authoritative tracks, modules and lessons.
- `progress/` — validated lesson completion and idempotent progress records.
- `gamification/` — server-calculated XP and achievements.
- `certificates/` — eligibility checks and verifiable issuance.
- `community/` — comments, moderation and abuse controls.
- `tutor/` — bounded tutoring requests and provider integration.

Each module should expose routes/controllers, validation schemas and domain services
through explicit interfaces. Keep database access inside the owning module or repository
layer; do not let routes implement business rules.
