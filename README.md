# @devright/pi-shield-gate

`@devright/pi-shield-gate` is a strictly typed TypeScript middleware toolkit for Pi Network webview apps that need reliable authentication, anti-bot controls, and direct Supabase RLS integration.

## Why this library

Pi app teams commonly face three production issues:

- **Authentication drift**: token expiration after app background/resume flows.
- **Security abuse**: emulator farms, scripted webviews, and Sybil patterns.
- **Debug blind spots**: hard-to-diagnose `401 Unauthorized` failures between Pi auth and Supabase JWT verification.

Pi Shield Gate addresses these with typed, composable modules:

- PCT-aligned token validation (`pi-pct-auth-validator`)
- Supabase RLS JWT exchange (`pi-supabase-rls-adapter`)
- Silent refresh and offline auth cache
- Device fingerprinting, Sybil checks, session hijack monitoring
- Geofencing, injection sanitization, honeypot detection
- React provider + hook + protected route gate
- Universal debugging and API rate-limit telemetry

## Install

```bash
npm install @devright/pi-shield-gate
```

Peer dependencies:

- `react`
- `react-dom`
- `@supabase/supabase-js`

## PCT-compliant authentication flow

1. Run `window.Pi.authenticate()` inside the native Pi webview.
2. Send `accessToken` to your backend verification endpoint.
3. Verify token against Pi Core Team backend standards server-side.
4. Return normalized validation payload to the client.
5. Exchange validated identity for a backend-signed Supabase JWT.

```ts
import {
  authenticateAndValidatePiUser,
  createSupabaseRlsSession,
  type SupabaseRlsMappingProfile
} from '@devright/pi-shield-gate';

const { validation } = await authenticateAndValidatePiUser(
  ['username', 'payments', 'kyc'],
  undefined,
  { verifyEndpoint: '/api/pi/verify' }
);

const profile: SupabaseRlsMappingProfile = {
  role: 'authenticated',
  audience: 'authenticated',
  issuer: 'https://your-domain.example',
  ttlSeconds: 3600,
  includeAppMetadata: true,
  includeUserMetadata: true
};

const supabaseJwt = await createSupabaseRlsSession(validation, profile, {
  signer: async (claims) => {
    const response = await fetch('/api/auth/sign-supabase-jwt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claims })
    });
    return response.json();
  }
});
```

> Security note: never embed your Supabase JWT signing secret in client code. Always sign on a secure backend.

## Supabase RLS setup guide

Use claims emitted by this library to drive RLS policies:

- `auth.jwt() ->> 'pi_uid'`
- `auth.jwt() ->> 'pi_country'`
- `auth.jwt() ->> 'pi_kyc_verified'`
- `auth.jwt() ->> 'role'`

Example policy:

```sql
create policy "pi_user_can_select_own_rows"
on public.user_profiles
for select
using (auth.jwt() ->> 'pi_uid' = pi_uid);
```

For marketplace scoping:

```sql
create policy "country_match_required"
on public.marketplace_posts
for insert
with check ((auth.jwt() ->> 'pi_country') = country_code);
```

## Universal debugging suite

### `debugPiAuthFailure`

Transforms vague auth errors into actionable hints:

- `PI_SDK_NOT_FOUND`
- `TOKEN_EXPIRED`
- `AUTH_401`
- `SUPABASE_JWT_SECRET_MISMATCH`
- `NETWORK_FAILURE`

```ts
import { debugPiAuthFailure } from '@devright/pi-shield-gate';

try {
  // auth flow
} catch (error) {
  debugPiAuthFailure(error, { route: '/premium/chat' });
}
```

### `PiRateLimitTracker`

Consumes `x-ratelimit-*` headers and warns before hard limits are hit.

```ts
import { PiRateLimitTracker } from '@devright/pi-shield-gate';

const tracker = new PiRateLimitTracker({ warningThreshold: 0.8, criticalThreshold: 0.95 });
const response = await fetch('/api/protected');
tracker.recordResponse('/api/protected', response);
```

## React integration

All React modules are client-safe:

- `ShieldProvider`
- `useShield`
- `SecureAuthGate`

```tsx
'use client';

import { ShieldProvider, SecureAuthGate } from '@devright/pi-shield-gate';

export default function App(): JSX.Element {
  return (
    <ShieldProvider
      authValidatorOptions={{ verifyEndpoint: '/api/pi/verify' }}
      rlsProfile={{
        role: 'authenticated',
        audience: 'authenticated',
        issuer: 'https://your-domain.example',
        ttlSeconds: 3600
      }}
      supabaseAdapterOptions={{
        signer: async (claims) => {
          const response = await fetch('/api/auth/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ claims })
          });
          return response.json();
        }
      }}
    >
      <SecureAuthGate>
        <main>Protected app content</main>
      </SecureAuthGate>
    </ShieldProvider>
  );
}
```

## Build

```bash
npm run typecheck
npm run build
```

## License

MIT
