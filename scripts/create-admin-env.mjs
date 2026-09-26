import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
// Exclusive creation: never overwrite existing secrets/configuration.
writeFileSync('.env.local', `MIO_ADMIN_ACCESS_KEY=${randomBytes(32).toString('hex')}\nMIO_ADMIN_SESSION_SECRET=${randomBytes(32).toString('hex')}\n`, { flag:'wx', mode:0o600 });
console.log('Created .env.local (owner-only permissions). Copy MIO_ADMIN_ACCESS_KEY to your password manager; do not put it in a URL or Git.');
