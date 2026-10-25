import './styles.css';
import { createIcons, Bell, CalendarDays, Wrench, Search, Ticket as TicketIcon, Plus, Check, RefreshCw, Trash2, Send, Square, GraduationCap, House, MessagesSquare, LayoutGrid, UserRound } from 'lucide';
import { ApiError, DemoAdapter } from './adapter';
import { parseScheduleCsv } from './csv';
import { newId } from './offline';
import { loadState, saveState, sessionFor } from './state';
import type { ActivityDraft, Confirmation, Draft, Page, PendingSubmission, PersistedState, Ticket } from './types';

const root = document.querySelector<HTMLDivElement>('#app')!;
let state = loadState();
let adapter = new DemoAdapter(state.mode, state.apiBaseUrl, sessionFor(state.sessionKey));
let stream: AbortController | null = null;
let busy = false, alert = '', error = '';
type Tab = 'notices' | 'repair' | 'schedule' | 'lost' | 'activities';
let tab: Tab = 'repair';
let repair = state.drafts.at(-1) ?? null, lost = state.lostDrafts.at(-1) ?? null;
let repairConfirmation: Confirmation | null = null, lostConfirmation: Confirmation | null = null;
let activityDraft: ActivityDraft | null = null;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
const icon = (name: string) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const fmt = (s: string) => Number.isFinite(Date.parse(s)) ? new Intl.DateTimeFormat('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(s)) : '时间未知';
const field = (id: string) => (root.querySelector<HTMLInputElement>(`#${id}`)?.value ?? '').trim();
const status = () => error ? `<div role="alert" class="alert error">${esc(error)}</div>` : alert ? `<div role="status" class="alert success">${esc(alert)}</div>` : '';
const tabs: [Tab, string, string][] = [['notices','通知','bell'],['schedule','课程考试','calendar-days'],['repair','报修','wrench'],['lost','失物','search'],['activities','活动','ticket']];
const campus = () => state.sessionKey === 'campus-user';
function persist() { saveState(state); }
function notify(text: string, failed = false) { error = failed ? text : ''; alert = failed ? '' : text; render(); }
function navigate(page: Page, service?: Tab) { if (service) tab = service; state.page = page; persist(); render(); }
function switchScope(mode = state.mode, session = state.sessionKey, base = state.apiBaseUrl) {
  stream?.abort(); persist(); state = loadState(mode, session, base); state.page = 'profile';
  adapter = new DemoAdapter(mode, base, sessionFor(session)); repair = state.drafts.at(-1) ?? null; lost = state.lostDrafts.at(-1) ?? null;
  repairConfirmation = null; lostConfirmation = null; activityDraft = null; alert = ''; error = ''; persist(); render(); void refreshLists();
}
function review(draft: Draft | null) {
  if (!draft) return '<p class="empty">尚无待确认草稿</p>';
  return `<dl class="review">${Object.entries(draft.displayFields).map(([key,value]) => `<dt>${esc(({location:'位置',description:'问题描述',contactAlias:'联系别名',kind:'类型',itemDescription:'物品描述',occurredOn:'日期',title:'活动',activityId:'活动编号',session:'场次'} as Record<string,string>)[key] ?? key)}</dt><dd>${esc(value)}</dd>`).join('')}</dl><p class="muted">草稿 ${esc(draft.draftId)} · 修订 ${draft.revision}<br>有效至 ${fmt(draft.expiresAt)}<br>依据 ${draft.evidenceRefs?.map(e => `${esc(e.evidenceId)}@${esc(e.version)}`).join(' · ') || '未提供'}</p>`;
}
function ticketList() { return state.tickets.length ? `<ul class="list">${state.tickets.map(t => `<li><strong>${esc(t.ticketId)} <span class="tag">${esc(t.status)}</span></strong><p>${esc(t.displayFields?.location)} · ${esc(t.displayFields?.description)}</p><small>requestId ${esc(t.requestId)} · 合成回执</small></li>`).join('')}</ul>` : '<p class="empty">暂无工单</p>'; }
function home() {
  const schedule = [...state.serverSchedule, ...state.localSchedule].sort((a,b) => Date.parse(a.startsAt)-Date.parse(b.startsAt)).filter(i => Date.parse(i.endsAt)>Date.now()).slice(0,3);
  return `<div class="page-head"><h2>校园服务</h2><span class="muted">${new Date().toLocaleDateString('zh-CN')} · 合成环境</span></div>${status()}<section class="service-grid">${tabs.map(([key,title,i]) => `<button class="service-tile" data-service="${key}">${icon(i)}<strong>${title}</strong></button>`).join('')}</section><div class="grid two"><section class="section"><h3>近期日程 <span class="count">${schedule.length}</span></h3>${schedule.length ? `<ul class="list">${schedule.map(i=>`<li><strong>${esc(i.title)} <span class="tag">${i.kind==='exam'?'考试':'课程'}</span></strong><p>${fmt(i.startsAt)} · ${esc(i.location)} · ${i.localPersonal?'个人本地':'合成'}</p></li>`).join('')}</ul>`:'<p class="empty">暂无近期日程</p>'}<button class="text-btn" data-service="schedule">查看日程</button></section><section class="section"><h3>通知</h3>${state.notices.length ? `<ul class="list">${state.notices.slice(0,2).map(i=>`<li><strong>${esc(i.title)}</strong><p>${esc(i.content)}</p></li>`).join('')}</ul>`:'<p class="empty">暂无通知</p>'}</section></div><div class="grid two"><section class="section"><h3>待办</h3>${todoList()}<div class="composer"><input id="todo" placeholder="新增待办" aria-label="新增待办" maxlength="200"><button class="icon-btn" title="添加待办" data-action="add-todo">${icon('plus')}</button></div></section><section class="section"><h3>最近服务</h3>${state.recentServices.length ? `<ul class="list">${state.recentServices.slice(-5).reverse().map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`:'<p class="empty">暂无服务记录</p>'}</section></div>`;
}
function todoList() { return `<ul class="list">${state.todos.map((t,i)=>`<li class="todo"><span>${esc(t)}</span><button class="icon-btn" data-todo="${i}" title="完成待办">${icon('check')}</button></li>`).join('')}</ul>`; }
function chat() {
  return `<div class="page-head"><h2>对话</h2><span class="tag">AI 无业务写权限</span></div>${status()}<section class="chat-area"><div class="messages" aria-live="polite">${state.messages.length ? state.messages.map(m=>`<article class="message ${m.role}"><p>${esc(m.text || (stream ? '正在回答…' : '没有完整回答'))}</p>${m.incomplete?`<small class="warning">${stream?'回答中':'回答未完成'}</small>`:''}${m.evidenceRefs?.length?`<details><summary>引用 ${m.evidenceRefs.length}</summary>${m.evidenceRefs.map(e=>`<p>${esc(e.evidenceId)} @ ${esc(e.version)}</p>`).join('')}</details>`:''}${m.intent && ['repair','schedule','lost','activity','notice'].includes(m.intent)?`<button class="text-btn" data-service="${({repair:'repair',schedule:'schedule',lost:'lost',activity:'activities',notice:'notices'} as Record<string,string>)[m.intent]}">进入${({repair:'报修',schedule:'日程',lost:'失物',activity:'活动',notice:'通知'} as Record<string,string>)[m.intent]}服务</button>`:''}</article>`).join(''):'<p class="empty">暂无对话</p>'}</div><div class="composer"><textarea id="chat-input" aria-label="问题" placeholder="查询通知、日程或服务事项" maxlength="1000"></textarea><button class="icon-btn accent" data-action="send-chat" title="发送" ${stream?'disabled':''}>${icon('send')}</button><button class="icon-btn" data-action="cancel-chat" title="取消回答" ${stream?'':'disabled'}>${icon('square')}</button></div></section>`;
}
function repairView() {
  const pending = state.pending;
  return `<div class="grid two"><section class="section"><h3>报修草稿</h3><div class="form-grid"><label>位置<input id="repair-location" maxlength="200" value="${esc(repair?.displayFields.location)}" placeholder="教学楼 A203"></label><label>问题描述<textarea id="repair-description" maxlength="500">${esc(repair?.displayFields.description)}</textarea></label><label>合成联系别名<input id="repair-contact" value="${esc(repair?.displayFields.contactAlias ?? 'SYN-CONTACT-K')}" placeholder="SYN-CONTACT-K"></label><button class="primary" data-action="repair-draft" ${pending?'disabled':''}>生成草稿</button></div></section><section class="section"><h3>核对与确认</h3>${review(repair)}${repair && !pending ? `<div class="button-row"><button class="secondary" data-action="repair-confirm">明确确认以上内容</button>${repairConfirmation?'<button class="primary" data-action="repair-submit">提交演示工单</button>':''}</div>`:''}${pending?`<div class="alert warning">结果待确认 · ${esc(pending.requestId)}<div class="button-row"><button class="secondary" data-action="query-result">按原 requestId 查询</button><button class="text-btn" data-action="retry-repair">重试原幂等请求</button></div></div>`:''}</section></div><section class="section"><div class="page-head"><h3>我的工单</h3><button class="icon-btn" title="刷新工单" data-action="refresh">${icon('refresh-cw')}</button></div>${ticketList()}</section>`;
}
function scheduleView() {
  const items = [...state.serverSchedule, ...state.localSchedule].sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
  return `<div class="grid two"><section class="section"><h3>课程与考试</h3><ul class="list">${items.map(i=>`<li><strong>${esc(i.title)} <span class="tag">${i.kind==='exam'?'考试':'课程'}</span></strong><p>${fmt(i.startsAt)} — ${fmt(i.endsAt)} · ${esc(i.location)}</p><small>${i.localPersonal?'个人本地日程':'合成日程'}</small></li>`).join('')}</ul>${items.length?'':'<p class="empty">暂无日程</p>'}</section><section class="section"><h3>个人日程</h3><label>CSV 文件<input id="schedule-file" type="file" accept=".csv,text/csv"></label><p class="muted">title,kind,location,startsAt,endsAt<br>kind：course / exam；时间含时区，例如 2026-10-13T08:00:00+08:00。仅保存本机，不上传。最多 500 条、256 KB。ICS 暂不支持。</p><div class="button-row"><button class="primary" data-action="import-csv">校验并导入</button><button class="icon-btn" title="删除个人导入" data-action="clear-schedule">${icon('trash-2')}</button></div></section></div>`;
}
function lostView() {
  return `<div class="grid two"><section class="section"><h3>失物 / 拾物草稿</h3><div class="form-grid"><label>类型<select id="lost-kind"><option value="LOST">失物</option><option value="FOUND" ${lost?.displayFields.kind==='FOUND'?'selected':''}>拾物</option></select></label><label>物品描述<textarea id="lost-description" maxlength="500">${esc(lost?.displayFields.itemDescription)}</textarea></label><label>地点<input id="lost-location" value="${esc(lost?.displayFields.location)}"></label><label>日期<input id="lost-date" type="date" value="${esc(lost?.displayFields.occurredOn ?? new Date().toISOString().slice(0,10))}"></label><label>合成联系别名<input id="lost-contact" value="${esc(lost?.displayFields.contactAlias ?? 'SYN-CONTACT-K')}"></label><button class="primary" data-action="lost-draft" ${state.pendingLost?'disabled':''}>生成草稿</button></div></section><section class="section"><h3>核对与确认</h3>${review(lost)}${lost && !state.pendingLost?`<div class="button-row"><button class="secondary" data-action="lost-confirm">明确确认以上内容</button>${lostConfirmation?'<button class="primary" data-action="lost-submit">发布到待审核</button>':''}</div>`:''}${state.pendingLost?'<div class="alert warning">发布结果待确认<button class="text-btn" data-action="lost-submit">重试原幂等请求</button></div>':''}</section></div><section class="section"><h3>待审核演示记录</h3><ul class="list">${state.lostItems.map(i=>`<li><strong>${esc(i.kind)} · ${esc(i.itemDescription)} <span class="tag">${esc(i.status)}</span></strong><p>${esc(i.location)} · ${esc(i.occurredOn)} · ${esc(i.contactAlias)}</p></li>`).join('')}</ul></section>`;
}
function activityView() {
  const signupSummary = state.signupsStatus === 'error' ? `<div class="alert warning">报名查询失败：${esc(state.signupsError ?? '连接不可用')}。保留已有数据，未将失败当作空列表。</div>` : state.signupsStatus === 'loaded' ? (state.signups.length ? `<ul class="list">${state.signups.map(s=>`<li>${esc(s.activityId)} · ${esc(s.status)}<p>${s.session ? `场次 ${esc(s.session)} · ` : ''}${s.submittedAt ? `提交 ${esc(s.submittedAt)} · ` : ''}${esc(s.signupId)} · ${state.mode === 'remote-http' ? '服务端' : '本地'}合成记录，非真实报名</p></li>`).join('')}</ul>` : '<p class="empty">暂无报名记录</p>') : '<p class="muted">尚未查询报名记录。</p>';
  return `<div class="grid two"><section class="section"><h3>活动</h3><ul class="list">${state.activities.map(i=>`<li><strong>${esc(i.title)} <span class="tag">${i.status==='OPEN' && Date.parse(i.deadlineAt)>Date.now()?`余量 ${i.remainingCapacity}`:'已截止'}</span></strong><p>${fmt(i.startsAt)} · ${esc(i.location)}<br>截止 ${fmt(i.deadlineAt)} · 场次 ${esc(i.session ?? '未提供')}</p><button class="text-btn" data-activity="${esc(i.activityId)}" ${state.pendingActivity?'disabled':''}>选择报名</button></li>`).join('')}</ul>${state.activities.length?'':'<p class="empty">暂无活动</p>'}</section><section class="section"><h3>核对报名内容</h3>${review(activityDraft)}${activityDraft&&!state.pendingActivity?'<button class="primary" data-action="activity-confirm">明确确认并提交演示报名</button>':''}${state.pendingActivity?'<div class="alert warning">报名结果待确认<button class="text-btn" data-action="activity-confirm">重试原幂等请求</button></div>':''}<div class="page-head spaced"><h3>我的演示报名</h3><button class="icon-btn" title="刷新我的报名" data-action="refresh">${icon('refresh-cw')}</button></div>${signupSummary}</section></div>`;
}
function services() {
  const denied = !campus() && ['schedule','lost','activities'].includes(tab);
  return `<div class="page-head"><h2>服务</h2><button class="icon-btn" title="刷新服务" data-action="refresh">${icon('refresh-cw')}</button></div>${status()}<div class="tabs" role="tablist">${tabs.map(([key,title,i])=>`<button role="tab" aria-selected="${tab===key}" class="${tab===key?'selected':''}" data-tab="${key}">${icon(i)}${title}</button>`).join('')}</div>${denied?'<div class="alert warning">FORBIDDEN：社区会话不能访问此校园服务。请切换校园演示会话。</div>':tab==='repair'?repairView():tab==='schedule'?scheduleView():tab==='lost'?lostView():tab==='activities'?activityView():`<section class="section"><ul class="list">${state.notices.map(i=>`<li><details><summary>${esc(i.title)}</summary><p>${esc(i.content)}</p><small>来源 ${esc(i.sourceId)} · ${esc(i.evidenceId)}@${esc(i.version)}<br>生效 ${esc(i.effectiveFrom)} · 失效 ${esc(i.effectiveTo ?? '未设定')} · 合成</small></details></li>`).join('')}</ul>${state.notices.length?'':'<p class="empty">暂无通知</p>'}</section>`}`;
}
function profile() {
  return `<div class="page-head"><h2>个人</h2></div>${status()}<div class="grid two"><section class="section"><h3>演示连接</h3><div class="form-grid"><label>模式<select id="mode"><option value="offline-synthetic" ${state.mode==='offline-synthetic'?'selected':''}>离线合成演示</option><option value="remote-http" ${state.mode==='remote-http'?'selected':''}>本地 API</option></select></label><label>演示会话<select id="session-select"><option value="campus-user" ${campus()?'selected':''}>校园学生 · campus-demo</option><option value="community-user" ${campus()?'':'selected'}>社区居民 · community-demo</option></select></label><label>API Base URL<input id="api-base" value="${esc(state.apiBaseUrl)}"></label><p class="muted">/backend 通过本地 Vite 代理到 http://127.0.0.1:38082；也可设置完整地址。X-Demo-Session 是本地演示认证。</p><div class="button-row"><button class="primary" data-action="save-profile">保存设置</button><button class="secondary" data-action="health">检查连接</button></div></div></section><section class="section"><h3>偏好与本地数据</h3><label class="check"><input id="pref-compact" type="checkbox" ${state.preferences.compact?'checked':''}>紧凑显示</label><label class="check"><input id="pref-notify" type="checkbox" ${state.preferences.notifications?'checked':''}>保存提醒偏好</label><p class="muted">Web 不提供鸿蒙系统通知或服务卡片。个人 CSV、对话、偏好、待办与最近服务仅存本浏览器。不同模式、接口地址和会话分开保存。</p><button class="text-btn" data-action="clear-local">清除当前会话聊天与个人导入</button><h3 class="spaced">待办</h3>${todoList()}</section></div>`;
}
function render() {
  root.innerHTML = `<div class="app-shell ${state.preferences.compact?'compact':''}"><header class="topbar"><div class="brand">${icon('graduation-cap')}<div><h1>校园智能助手</h1><small>合成演示 · 非真实学校受理</small></div></div><div class="top-actions"><span class="badge">${state.mode==='offline-synthetic'?'离线演示':'本地 API'}</span><span class="domain">${campus()?'校园':'社区'}会话</span></div></header><main>${state.page==='home'?home():state.page==='chat'?chat():state.page==='services'?services():profile()}</main><nav class="bottom-nav" aria-label="主导航">${(['home','chat','services','profile'] as Page[]).map((p,i)=>`<button data-page="${p}" class="${p===state.page?'active':''}">${icon(['house','messages-square','layout-grid','user-round'][i])}<span>${['首页','对话','服务','个人'][i]}</span></button>`).join('')}</nav></div>`;
  createIcons({ icons: { Bell, CalendarDays, Wrench, Search, Ticket: TicketIcon, Plus, Check, RefreshCw, Trash2, Send, Square, GraduationCap, House, MessagesSquare, LayoutGrid, UserRound } });
  root.querySelectorAll<HTMLElement>('[data-page]').forEach(el=>el.onclick=()=>navigate(el.dataset.page as Page));
  root.querySelectorAll<HTMLElement>('[data-service]').forEach(el=>el.onclick=()=>navigate('services',el.dataset.service as Tab));
  root.querySelectorAll<HTMLElement>('[data-tab]').forEach(el=>el.onclick=()=>{tab=el.dataset.tab as Tab;render();});
  root.querySelectorAll<HTMLElement>('[data-todo]').forEach(el=>el.onclick=()=>{state.todos.splice(Number(el.dataset.todo),1);persist();render();});
  root.querySelectorAll<HTMLElement>('[data-activity]').forEach(el=>el.onclick=()=>void perform(()=>chooseActivity(el.dataset.activity!)));
  root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(el=>{
    const action=el.dataset.action!;
    if (busy && !['cancel-chat'].includes(action)) el.disabled=true;
    el.onclick=()=>void (action==='cancel-chat' ? stream?.abort() : perform(()=>actions[action]?.()));
  });
  if (stream) root.querySelector('.messages')?.scrollTo(0,100000);
}
async function perform(fn:()=>unknown) {
  if(busy) return; busy=true; error=''; alert='';
  root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b=>{ if(b.dataset.action!=='cancel-chat') b.disabled=true; });
  try { await fn(); } catch(e) { error=(e as Error).message; alert=''; } finally { busy=false;render(); }
}
async function refreshLists() {
  const current=adapter, scope=state;
  const calls = [
    ['notices',()=>current.getNotices()], ['tickets',()=>current.getTickets()],
    ...(campus() ? [['serverSchedule',()=>current.getSchedule()],['activities',()=>current.getActivities()],['lostItems',()=>current.getLostItems()],['signups',()=>current.getMySignups()]] : [])
  ] as [keyof PersistedState, ()=>Promise<{data:{items:unknown[]}|null}>][];
  const failures:string[]=[];
  for(const [key,fn] of calls) {
    try {
      const response=await fn(); if(state!==scope) return;
      (state as unknown as Record<string,unknown>)[key]=response.data?.items ?? [];
      if (key === 'signups') { state.signupsStatus = 'loaded'; state.signupsError = undefined; }
    }
    catch(e){
      if(state!==scope) return;
      if (key === 'signups') { state.signupsStatus = 'error'; state.signupsError = (e as Error).message; }
      else (state as unknown as Record<string,unknown>)[key]=[];
      failures.push((e as Error).message);
    }
  }
  if(failures.length) { error=`服务读取失败：${failures.join('；')}`;alert=''; } persist();render();
}
async function sendChat() {
  if(stream) return;
  const text=field('chat-input');if(!text)return;
  const scope=state, current=adapter, controller=new AbortController();stream=controller;
  state.messages.push({role:'user',text});
  const suggestedIntent = /报修|漏水|坏/.test(text) ? 'repair' : /课程|考试|课表/.test(text) ? 'schedule' : /失物|拾物/.test(text) ? 'lost' : /活动/.test(text) ? 'activity' : /通知|公告/.test(text) ? 'notice' : '';
  const message: PersistedState['messages'][number]={role:'assistant',text:'',incomplete:true,intent:suggestedIntent};
  state.messages.push(message);persist();render();
  let terminal=false, meta=false, fatal=false;
  const timeout=setTimeout(()=>controller.abort(),30000);
  try{
    for await(const event of current.streamChat(newId('request'),text,scope.conversationId,controller.signal)){
      if(state!==scope) break;
      if(event.type==='meta'){if(meta||terminal)throw new Error('重复或越序 meta');meta=true;message.evidenceRefs=(event.data.evidenceRefs as typeof message.evidenceRefs)??[];message.intent=String(event.data.intent??message.intent);}
      if(event.type==='delta'){if(!meta||terminal)throw new Error('流式事件顺序无效');message.text+=String(event.data.text??'');}
      if(event.type==='error'){notify(String(event.data.message??'流式错误'),true);if(!event.data.canFallback){fatal=true;throw new Error(String(event.data.message));}}
      if(event.type==='done'){if(!meta||terminal||fatal||event.data.status!=='COMPLETED')throw new Error('无效完成事件');terminal=true;}
      persist();render();
    }
    message.incomplete=!terminal;
    if(!terminal)error='连接已结束，未收到有效 done，回答未完成。';
  }catch(e){message.incomplete=true;error=controller.signal.aborted?'已取消或超时，回答未完成。':`连接失败，回答未完成：${(e as Error).message}`;}
  finally{clearTimeout(timeout);if(state===scope){persist();}if(stream===controller)stream=null;render();}
}
async function createRepair(){
  if(state.pending)throw new Error('先恢复原提交结果');
  repair=(await adapter.createDraft(newId('request'),{location:field('repair-location'),description:field('repair-description'),contactAlias:field('repair-contact')},'repair')).data;
  repairConfirmation=null;state.drafts=repair?[repair]:[];persist();notify('草稿已生成，请核对并明确确认。');
}
async function confirmRepair(){if(!repair)return;repairConfirmation=(await adapter.confirmDraft(newId('request'),repair,'repair')).data;notify('已确认当前草稿，可以提交演示工单。');}
async function acceptTicket(ticket: Ticket) {
  const verified=(await adapter.getTicket(ticket.ticketId)).data;if(!verified)throw new Error('回执工单无法查询，结果待确认');
  state.tickets=state.tickets.filter(t=>t.ticketId!==verified.ticketId);state.tickets.push(verified);
  state.pending=undefined;state.drafts=[];repair=null;repairConfirmation=null;state.recentServices.push('报修 · 合成 SUBMITTED');persist();notify('已查询到合成工单回执，非真实学校受理。');
}
async function submitRepair(){
  if(!state.pending){if(!repair||!repairConfirmation)throw new Error('CONFIRMATION_REQUIRED');state.pending={requestId:newId('request'),key:newId('idem'),draft:repair,confirmation:repairConfirmation};persist();}
  const p=state.pending;
  try {const result=await adapter.submitRepair(p.requestId,p.draft,p.confirmation,p.key);if(!result.data)throw new Error('空回执');await acceptTicket(result.data);}
  catch(e){if(e instanceof ApiError&&!e.uncertain){state.pending=undefined;repairConfirmation=null;persist();}throw e;}
}
async function queryResult(){
  const p=state.pending;if(!p)return;
  const result=(await adapter.getRequestResult(p.requestId)).data;
  if(result?.resultStatus==='COMMITTED' && result.ticketId){const ticket=(await adapter.getTicket(result.ticketId)).data;if(ticket)await acceptTicket(ticket);}
  else notify(`结果 ${result?.resultStatus??'UNKNOWN'}，尚不能认定已提交。保留原请求与幂等键。`,true);
}
async function createLost(){
  const fields={kind:field('lost-kind'),itemDescription:field('lost-description'),location:field('lost-location'),occurredOn:field('lost-date'),contactAlias:field('lost-contact')};
  lost=(await adapter.createDraft(newId('request'),fields,'lost')).data;lostConfirmation=null;state.lostDrafts=lost?[lost]:[];persist();notify('请核对失物草稿。');
}
async function submitLost(){
  if(!state.pendingLost){if(!lost||!lostConfirmation)throw new Error('CONFIRMATION_REQUIRED');state.pendingLost={requestId:newId('request'),key:newId('idem'),draft:lost,confirmation:lostConfirmation};persist();}
  const p=state.pendingLost;
  try{const receipt=(await adapter.submitLost(p.requestId,p.draft,p.confirmation,p.key)).data;if(receipt){state.lostItems=state.lostItems.filter(i=>i.lostItemId!==receipt.lostItemId);state.lostItems.push(receipt);state.pendingLost=undefined;lost=null;lostConfirmation=null;state.lostDrafts=[];state.recentServices.push('失物 · 合成待审核');persist();notify('合成发布进入待审核，尚未公开发布。');}}
  catch(e){if(e instanceof ApiError&&!e.uncertain){state.pendingLost=undefined;lostConfirmation=null;persist();}throw e;}
}
async function chooseActivity(id:string){
  const activity=state.activities.find(i=>i.activityId===id);if(!activity)return;
  if(!activity.session)throw new Error('活动未提供可确认的场次');
  activityDraft=(await adapter.createActivityDraft(newId('request'),activity,activity.session,'SYN-CONTACT-K')).data;render();
}
async function submitActivity(){
  if(!state.pendingActivity){
    if(!activityDraft)return;
    const confirmation=(await adapter.confirmActivityDraft(newId('request'),activityDraft)).data;if(!confirmation)throw new Error('CONFIRMATION_REQUIRED');
    state.pendingActivity={requestId:newId('request'),key:newId('idem'),draft:activityDraft,confirmation};persist();
  }
  const p=state.pendingActivity, activity=state.activities.find(i=>i.activityId===p.draft.displayFields.activityId);if(!activity)throw new Error('活动不可用');
  try{const receipt=(await adapter.submitActivity(p.requestId,p.draft as ActivityDraft,p.confirmation,p.key,activity)).data;if(receipt){state.signups=state.signups.filter(s=>s.signupId!==receipt.signupId);state.signups.push(receipt);state.pendingActivity=undefined;activityDraft=null;state.recentServices.push('活动 · 合成 SUBMITTED');persist();await refreshLists();notify('已保存合成报名回执，非真实报名。');}}
  catch(e){if(e instanceof ApiError&&!e.uncertain){state.pendingActivity=undefined;persist();}throw e;}
}
const actions:Record<string,()=>unknown>={
  'send-chat':sendChat, 'repair-draft':createRepair, 'repair-confirm':confirmRepair, 'repair-submit':submitRepair, 'retry-repair':submitRepair, 'query-result':queryResult,
  'lost-draft':createLost, 'lost-confirm':async()=>{if(lost)lostConfirmation=(await adapter.confirmDraft(newId('request'),lost,'lost')).data;notify('已确认失物草稿。');}, 'lost-submit':submitLost, 'activity-confirm':submitActivity,
  'refresh':refreshLists, 'health':async()=>{const result=await adapter.health();notify(`连接状态：${result.data?.status} · 合成环境`);},
  'save-profile':()=>{
    const base=field('api-base');if(base!=='/backend'&&!/^https?:\/\/[^\s]+$/.test(base))throw new Error('API 地址须为 /backend 或完整 http(s) URL');
    state.preferences.compact=(root.querySelector<HTMLInputElement>('#pref-compact')?.checked??false);state.preferences.notifications=(root.querySelector<HTMLInputElement>('#pref-notify')?.checked??false);
    const mode=field('mode') as PersistedState['mode'],session=field('session-select') as PersistedState['sessionKey'];
    if(mode===state.mode&&session===state.sessionKey&&base===state.apiBaseUrl){persist();notify('偏好已保存');}else switchScope(mode,session,base);
  },
  'clear-local':()=>{state.messages=[];state.localSchedule=[];persist();notify('已清除当前会话聊天和个人导入');},
  'add-todo':()=>{const text=field('todo');if(text){state.todos.push(text);persist();render();}},
  'clear-schedule':()=>{state.localSchedule=[];persist();notify('个人导入已删除，合成日程保留');},
  'import-csv':async()=>{const file=root.querySelector<HTMLInputElement>('#schedule-file')?.files?.[0];if(!file)throw new Error('请选择 CSV 文件');if(file.size>256000)throw new Error('CSV 最大 256 KB');const parsed=parseScheduleCsv(await file.text());state.localSchedule=parsed;persist();notify(`已导入 ${parsed.length} 条个人日程，仅本机保存。`);}
};
render();void refreshLists();
