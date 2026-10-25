import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OfflineStore, type StoragePort } from '../src/offline';
import { DemoAdapter, ApiError } from '../src/adapter';
import { parseScheduleCsv } from '../src/csv';
import { SSEDecoder } from '../src/sse';
import { sessionFor, storageKey } from '../src/state';
import type { Activity, Confirmation, Ticket } from '../src/types';

class Memory implements StoragePort { entries = new Map<string,string>(); getItem(key:string) { return this.entries.get(key) ?? null; } setItem(key:string,value:string) { this.entries.set(key,value); } }
const baseTime = Date.parse('2026-10-12T10:00:00+08:00');
const activity: Activity = { activityId:'activity-test', title:'合成活动', location:'礼堂', startsAt:'2026-10-20T10:00:00+08:00', deadlineAt:'2026-10-19T10:00:00+08:00', remainingCapacity:2, status:'OPEN', session:'morning' };
const fields = { location:'教学楼 A203', description:'合成灯故障', contactAlias:'SYN-CONTACT-K' };
test('confirmation cannot be bypassed, modified or reused across domain',()=>{
  const memory=new Memory(), campus=new OfflineStore(sessionFor('campus-user'),[activity],memory,()=>baseTime), community=new OfflineStore(sessionFor('community-user'),[activity],memory,()=>baseTime);
  const d=campus.draft(fields,'repair'), c=campus.confirm(d,'repair');
  assert.throws(()=>campus.submit('r1',d,{} as Confirmation,'k1','repair'),/CONFIRMATION_REQUIRED/);
  assert.throws(()=>campus.submit('r1',{...d,displayFields:{...fields,location:'篡改'}},c,'k1','repair'),/RECONFIRM_REQUIRED/);
  assert.throws(()=>community.confirm(d,'repair'),/FORBIDDEN/);
  assert.throws(()=>community.draft({kind:'LOST',itemDescription:'水杯',location:'服务台',occurredOn:'2026-10-11',contactAlias:'SYN-CONTACT-M'},'lost'),/FORBIDDEN/);
  assert.equal(campus.items().tickets.length,0);
});
test('idempotent receipt persists atomically and request lookup never fabricates success',()=>{
  const memory=new Memory(), store=new OfflineStore(sessionFor('campus-user'),[activity],memory,()=>baseTime), d=store.draft(fields,'repair'), c=store.confirm(d,'repair');
  assert.equal(store.request('missing').resultStatus,'NOT_FOUND');
  const first=store.submit('r1',d,c,'k1','repair') as Ticket;
  const restarted=new OfflineStore(sessionFor('campus-user'),[activity],memory,()=>baseTime+999999);
  assert.deepEqual(restarted.submit('r1',d,c,'k1','repair'),first);
  assert.throws(()=>restarted.submit('r2',d,c,'k1','repair'),/IDEMPOTENCY_CONFLICT/);
  assert.equal(restarted.request('r1').ticketId,first.ticketId);
  assert.equal(restarted.items().tickets.length,1);
});
test('draft/confirmation expiry rejects writes',()=>{
  let clock=baseTime;const store=new OfflineStore(sessionFor('campus-user'),[activity],new Memory(),()=>clock), d=store.draft(fields,'repair'), c=store.confirm(d,'repair');
  clock+=120001;assert.throws(()=>store.submit('r1',d,c,'k1','repair'),/RECONFIRM_REQUIRED/);
});
test('lost requires confirmation and returns pending review',()=>{
  const store=new OfflineStore(sessionFor('campus-user'),[activity],new Memory(),()=>baseTime);
  assert.throws(()=>store.draft({...fields,kind:'校园卡',itemDescription:'蓝卡套',occurredOn:'2026-10-11'},'lost'),/VALIDATION_ERROR/);
  const d=store.draft({...fields,kind:'FOUND',itemDescription:'蓝卡套',occurredOn:'2026-10-11'},'lost');
  assert.equal(store.submit('l1',d,store.confirm(d,'lost'),'lk','lost').status,'PENDING_REVIEW');
});
test('activity rechecks deadline/capacity, prevents duplicates and replays immutable receipt',()=>{
  let clock=baseTime;const store=new OfflineStore(sessionFor('campus-user'),[activity],new Memory(),()=>clock), f={activityId:activity.activityId,session:'morning',contactAlias:'SYN-CONTACT-K'};
  const d=store.draft(f,'activity'), c=store.confirm(d,'activity');
  const receipt=store.submit('a1',d,c,'ak','activity');
  assert.deepEqual(store.submit('a1',d,c,'ak','activity'),receipt);
  assert.throws(()=>store.draft(f,'activity'),/ALREADY_SIGNED_UP/);
  assert.equal(store.items().activities[0].remainingCapacity,1);
  const full=new OfflineStore(sessionFor('campus-user'),[{...activity,remainingCapacity:0}],new Memory(),()=>clock);
  assert.throws(()=>full.draft(f,'activity'),/CAPACITY_EXCEEDED/);
  const closing=new OfflineStore(sessionFor('campus-user'),[{...activity,deadlineAt:new Date(baseTime+60000).toISOString()}],new Memory(),()=>clock);
  const dd=closing.draft(f,'activity'), cc=closing.confirm(dd,'activity');clock+=60001;
  assert.throws(()=>closing.submit('a2',dd,cc,'ak2','activity'),/ACTIVITY_CLOSED/);
});
test('activity signup ledger persists for the same demo session and stays isolated by domain',()=>{
  const memory=new Memory(), campus=new OfflineStore(sessionFor('campus-user'),[activity],memory,()=>baseTime);
  const fields={activityId:activity.activityId,session:'morning',contactAlias:'SYN-CONTACT-K'};
  const draft=campus.draft(fields,'activity'), confirmation=campus.confirm(draft,'activity');
  const signup=campus.submit('signup-recovery',draft,confirmation,'signup-key','activity');
  const restarted=new OfflineStore(sessionFor('campus-user'),[activity],memory,()=>baseTime+1000);
  assert.deepEqual(restarted.items().signups,[signup]);
  assert.equal(new OfflineStore(sessionFor('community-user'),[activity],memory,()=>baseTime).items().signups.length,0);
});
test('remote signup query keeps trusted session header and requires synthetic envelope flags',async()=>{
  const originalFetch=globalThis.fetch;
  let requestUrl='', requestHeaders:HeadersInit|undefined;
  globalThis.fetch=async(input,init)=>{
    requestUrl=String(input); requestHeaders=init?.headers;
    return new Response(JSON.stringify({code:'OK',message:'ok',data:{items:[{signupId:'s1',activityId:'activity-test',status:'SUBMITTED',session:'morning',synthetic:true,realBusinessWrite:false}],synthetic:true,realBusinessWrite:false},traceId:'trace-1'}),{status:200,headers:{'content-type':'application/json'}});
  };
  try {
    const adapter=new DemoAdapter('remote-http','http://example.test',{...sessionFor('campus-user'),roles:['student']});
    const response=await adapter.getMySignups();
    assert.equal(requestUrl,'http://example.test/api/v1/activity-signups');
    assert.equal(new Headers(requestHeaders).get('X-Demo-Session'),'campus-user');
    assert.equal(response.data?.items[0].session,'morning');
  } finally { globalThis.fetch=originalFetch; }
  globalThis.fetch=async()=>new Response(JSON.stringify({code:'OK',message:'ok',data:{items:[]},traceId:'trace-2'}),{status:200,headers:{'content-type':'application/json'}});
  try {
    const adapter=new DemoAdapter('remote-http','http://example.test',sessionFor('campus-user'));
    await assert.rejects(adapter.getMySignups(),(error:unknown)=>error instanceof ApiError && error.code==='NON_DEMO_RESPONSE');
  } finally { globalThis.fetch=originalFetch; }
});
test('CSV mature parser accepts quoted commas, rejects invalid dates/kinds/duplicates atomically',()=>{
  const header='title,kind,location,startsAt,endsAt\n', row='"课程,实验",course,A203,2026-10-13T08:00:00+08:00,2026-10-13T09:00:00+08:00';
  const items=parseScheduleCsv(header+row);assert.equal(items[0].title,'课程,实验');assert.equal(items[0].synthetic,false);
  for(const bad of [row.replace('course','unknown'),row.replace('09:00','07:00'),row.replaceAll('2026-10-13','2026-02-30'),row+'\n'+row,row.replace('08:00:00+08:00','08:00:00'), '']) assert.throws(()=>parseScheduleCsv(header+bad));
});
test('SSE handles fragmented UTF8 text/CRLF/multiline data without inventing done',()=>{
  const decoder=new SSEDecoder();
  assert.deepEqual(decoder.push('event: meta\r\ndata: {"requestId":"r"}\r'),[]);
  assert.equal(decoder.push('\n\r\nevent: delta\r\ndata: {"text":\r\ndata: "中文"}\r\n\r\n')[1].data.text,'中文');
  assert.deepEqual(decoder.push('event: done\ndata: {"status":"COMPLETED"}'),[]);
  assert.equal(decoder.push('\n\n')[0].type,'done');
});
test('storage scopes include mode, session and remote base URL',()=>{
  assert.notEqual(storageKey('offline-synthetic','campus-user','/backend'),storageKey('offline-synthetic','community-user','/backend'));
  assert.notEqual(storageKey('offline-synthetic','campus-user','/backend'),storageKey('remote-http','campus-user','/backend'));
  assert.notEqual(storageKey('remote-http','campus-user','/backend'),storageKey('remote-http','campus-user','http://127.0.0.1:1'));
});
test('offline rejects forged identity and conflicting body domain',()=>{
  assert.throws(()=>new OfflineStore({...sessionFor('campus-user'),domainId:'community-demo'},[activity],new Memory()),/FORBIDDEN/);
  const store=new OfflineStore(sessionFor('campus-user'),[activity],new Memory());
  assert.throws(()=>store.draft({...fields,domainId:'community-demo'},'repair'),/FORBIDDEN/);
});
