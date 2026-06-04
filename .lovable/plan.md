Change `src/routes/index.tsx` so unauthenticated visitors are sent to `/intake` instead of `/auth`. Authenticated users still go to `/dashboard`.

That's the only change — patients hitting the bare domain land directly on the intake form, while staff can still reach `/auth` directly to sign in.