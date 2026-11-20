const test = require('node:test');
const assert = require('node:assert/strict');
const { createSessionManagementService } = require('../src/modules/auth/session-management-service');
const { SESSION_COOKIE_NAME, CSRF_COOKIE_NAME } = require('../src/modules/auth/session-http-policy');

function makeRes() {
  return {
    statusCode:200, body:null, headers:{}, cleared:[], ended:false,
    set(k,v){this.headers[k]=v;return this;},
    status(v){this.statusCode=v;return this;},
    json(v){this.body=v;return this;},
    clearCookie(name,options){this.cleared.push({name,options});return this;},
    end(){this.ended=true;return this;}
  };
}
function setup() {
  const calls=[];
  const docs=[
    {_id:'s-current',createdAt:new Date('2026-11-01'),lastUsedAt:new Date('2026-11-20'),expiresAt:new Date('2026-12-01')},
    {_id:'s-other',createdAt:new Date('2026-10-01'),lastUsedAt:new Date('2026-11-19'),expiresAt:new Date('2026-12-01')}
  ];
  const Session={
    find(q){calls.push(['find',q]);return {select(){return this;},sort(){return this;},lean:async()=>docs};},
    findOne(){return {lean:async()=>null};},
    async updateOne(q,u){calls.push(['updateOne',q,u]);return {modifiedCount:1};},
    async updateMany(q,u){calls.push(['updateMany',q,u]);return {modifiedCount:2};}
  };
  const mongoose={startSession(){return {async withTransaction(fn){await fn();},async endSession(){}};}};
  const service=createSessionManagementService({
    mongoose,Session,RefreshToken:{},
    allowedOrigins:['https://nexusdev-frontend.vercel.app'],
    now:()=>new Date('2026-11-20T04:00:00Z')
  });
  const req={
    headers:{origin:'https://nexusdev-frontend.vercel.app'},
    params:{sessionId:'s-other'},
    user:{_id:'u1'},
    session:{id:'s-current',userId:'u1'},
    get(k){return this.headers[k.toLowerCase()];}
  };
  return {service,req,res:makeRes(),calls};
}

test('logout current revokes only the authenticated session and clears cookies',async()=>{
  const c=setup(); await c.service.logoutCurrent(c.req,c.res);
  assert.equal(c.res.statusCode,204);
  assert.deepEqual(c.calls[0][1],{_id:'s-current',userId:'u1',revokedAt:null});
  assert.equal(c.res.cleared.length,2);
  assert.ok([SESSION_COOKIE_NAME,CSRF_COOKIE_NAME].every(n=>c.res.cleared.some(x=>x.name===n)));
});
test('logout all revokes only sessions belonging to authenticated user',async()=>{
  const c=setup(); await c.service.logoutAll(c.req,c.res);
  assert.equal(c.res.statusCode,204);
  assert.deepEqual(c.calls[0][1],{userId:'u1',revokedAt:null});
});
test('session listing exposes safe metadata and marks current session',async()=>{
  const c=setup(); await c.service.listSessions(c.req,c.res);
  assert.equal(c.res.body.sessions.length,2);
  assert.equal(c.res.body.sessions[0].current,true);
  assert.equal(c.res.body.sessions[1].current,false);
  assert.equal('tokenHash' in c.res.body.sessions[0],false);
});
test('individual revocation scopes query to authenticated user',async()=>{
  const c=setup(); await c.service.revokeOne(c.req,c.res);
  assert.equal(c.res.statusCode,204);
  assert.deepEqual(c.calls[0][1],{_id:'s-other',userId:'u1',revokedAt:null});
});
test('rejects untrusted origin before modifying session state',async()=>{
  const c=setup(); c.req.headers.origin='https://attacker.example';
  await c.service.logoutAll(c.req,c.res);
  assert.equal(c.res.statusCode,403);
  assert.equal(c.calls.length,0);
});
