import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminConfig, allowLogin, createAdminSession, sameOrigin, SESSION_SECONDS, validAccessKey, validAdminSession } from './admin-session';
const config={accessKey:'a'.repeat(64),sessionSecret:'b'.repeat(64)};
afterEach(()=>vi.unstubAllEnvs());
describe('admin auth',()=>{
  it('fails closed for absent, weak or identical configuration',()=>{
    vi.stubEnv('MIO_ADMIN_ACCESS_KEY','');vi.stubEnv('MIO_ADMIN_SESSION_SECRET','');expect(adminConfig()).toBeNull();
    vi.stubEnv('MIO_ADMIN_ACCESS_KEY',config.accessKey);vi.stubEnv('MIO_ADMIN_SESSION_SECRET',config.accessKey);expect(adminConfig()).toBeNull();
    vi.stubEnv('MIO_ADMIN_SESSION_SECRET',config.sessionSecret);expect(adminConfig()).toEqual(config);
  });
  it('rejects wrong keys, tampering, expiration and rotating either secret',()=>{
    const now=1700000000000;const token=createAdminSession(config,now);
    expect(validAccessKey('wrong',config)).toBe(false);expect(validAccessKey(config.accessKey,config)).toBe(true);
    expect(validAdminSession(token,config,now)).toBe(true);expect(validAdminSession(token+'x',config,now)).toBe(false);expect(validAdminSession(token,config,now+SESSION_SECONDS*1000)).toBe(false);
    expect(validAdminSession(token,{...config,accessKey:'c'.repeat(64)},now)).toBe(false);expect(validAdminSession(token,{...config,sessionSecret:'c'.repeat(64)},now)).toBe(false);
    expect(validAdminSession(token,null,now)).toBe(false);expect(validAdminSession('malformed',config,now)).toBe(false);
  });
  it('checks origin, including missing origin and explicit external host configuration',()=>{
    vi.stubEnv('MIO_ADMIN_ORIGIN','');expect(sameOrigin(new Request('http://localhost:3100/api/admin/session',{headers:{origin:'https://evil.example'}}))).toBe(false);
    expect(sameOrigin(new Request('http://localhost:3100/api/admin/session'))).toBe(false);
    expect(sameOrigin(new Request('http://localhost:3100/api/admin/session',{headers:{origin:'http://localhost:3100'}}))).toBe(true);
    vi.stubEnv('MIO_ADMIN_ORIGIN','https://mio.example');expect(sameOrigin(new Request('http://internal/api/admin/session',{headers:{origin:'https://mio.example'}}))).toBe(true);
  });
  it('bounds attempts within a process and resets after the window',()=>{
    const now=Date.now();for(let i=0;i<10;i++)expect(allowLogin(now)).toBe(true);expect(allowLogin(now)).toBe(false);expect(allowLogin(now+15*60*1000)).toBe(true);
  });
});
