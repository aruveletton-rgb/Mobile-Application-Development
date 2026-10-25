import { common } from '@kit.AbilityKit';
import { Activity, ClientSnapshot, Draft, Evidence, Fields, Message, Notice, Pending, Receipt, Schedule, freshSnapshot } from '../model/Models';
import { ClientController } from '../services/ClientController';
import { chooseCsv } from '../services/ScheduleImport';
import { NativeCapabilities } from '../services/NativeCapabilities';

@Entry
@Component
struct Index {
  @State page: string = '首页';
  @State service: string = 'repair';
  @State snapshot: ClientSnapshot = freshSnapshot();
  @State notices: Notice[] = [];
  @State schedule: Schedule[] = [];
  @State mode: string = 'offline';
  @State appliedMode: string = 'offline';
  @State appliedSession: string = 'campus-user';
  @State session: string = 'campus-user';
  @State base: string = 'http://127.0.0.1:38082';
  @State feedback: string = '';
  @State nativeStatus: string = '设备能力尚未验证';
  @State signupStatus: string = 'unknown';
  @State signupError: string = '';
  @State busy: boolean = false;
  @State streaming: boolean = false;
  @State input: string = '';
  @State location: string = '';
  @State description: string = '';
  @State contact: string = 'SYN-CONTACT-K';
  @State lostKind: string = 'LOST';
  @State occurredOn: string = new Date().toISOString().slice(0, 10);
  @State todo: string = '';
  @State draft: Draft | null = null;
  @State confirmed: boolean = false;
  private controller: ClientController = new ClientController();
  private native: NativeCapabilities = new NativeCapabilities();

  aboutToAppear(): void {
    this.run(async () => { await this.controller.open(this.context()); });
  }
  aboutToDisappear(): void { this.controller.cancel(); }
  private context(): common.UIAbilityContext { return this.getUIContext().getHostContext() as common.UIAbilityContext; }
  private sync(): void {
    this.snapshot = JSON.parse(JSON.stringify(this.controller.state)) as ClientSnapshot;
    this.notices = this.controller.notices.slice(); this.schedule = this.controller.schedule.concat(this.snapshot.personalSchedule);
    this.mode = this.controller.mode; this.session = this.controller.session; this.base = this.controller.base;
    this.appliedMode = this.controller.mode; this.appliedSession = this.controller.session;
    this.signupStatus = this.controller.signupStatus; this.signupError = this.controller.signupError;
    this.draft = this.controller.latest(this.service); this.confirmed = this.draft !== null && this.controller.token(this.draft) !== null;
  }
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy) return; this.busy = true; this.feedback = '';
    try { await action(); } catch (e) { this.feedback = e instanceof Error ? e.message : '操作失败，未确认成功'; }
    finally { this.busy = false; this.sync(); }
  }
  private selectService(kind: string): void { this.service = kind; this.page = '服务'; this.sync(); }
  private async createDraft(): Promise<void> {
    const fields: Fields = this.service === 'repair' ? { location: this.location, description: this.description, contactAlias: this.contact } : { kind: this.lostKind, itemDescription: this.description, location: this.location, occurredOn: this.occurredOn, contactAlias: this.contact };
    await this.controller.create(this.service, fields); this.feedback = '草稿已保存，请核对以下内容';
  }
  private async send(): Promise<void> {
    const text = this.input.trim(); if (!text) return; this.input = ''; this.streaming = true;
    try { await this.controller.chat(text, () => this.sync()); } finally { this.streaming = false; }
  }

  build() {
    Column() {
      this.header();
      Scroll() {
        Column({ space: this.snapshot.compact ? 10 : 16 }) {
          if (this.feedback) { Text(this.feedback).fontSize(13).fontColor('#80551B').padding(12).width('100%').backgroundColor('#FCF4DC'); }
          if (this.page === '首页') { this.home(); }
          if (this.page === '对话') { this.chat(); }
          if (this.page === '服务') { this.services(); }
          if (this.page === '个人') { this.profile(); }
        }.width('100%').alignItems(HorizontalAlign.Start).padding(16);
      }.layoutWeight(1).width('100%');
      this.navigation();
    }.width('100%').height('100%').backgroundColor('#F7F8FA');
  }
  @Builder header() {
    Row({ space: 10 }) {
      Image($r('app.media.campus')).width(28).height(28);
      Column({ space: 4 }) { Text('校园智能助手').fontSize(18).fontWeight(FontWeight.Bold); Text('合成演示 · 非真实学校受理').fontSize(10).fontColor('#64707A'); }.alignItems(HorizontalAlign.Start);
      Blank();
      Column({ space: 4 }) { Text(this.appliedMode === 'offline' ? '离线演示' : '本地 API').fontSize(11).fontColor('#146551'); Text(this.appliedSession === 'campus-user' ? '校园会话' : '社区会话').fontSize(10).fontColor('#64707A'); }
    }.padding(14).width('100%').backgroundColor(Color.White);
  }
  @Builder title(text: string) { Text(text).fontSize(22).fontWeight(FontWeight.Bold).fontColor('#25303A'); }
  @Builder subtitle(text: string) { Text(text).fontSize(15).fontWeight(FontWeight.Bold).fontColor('#25303A').margin({ top: 8 }); }
  @Builder home() {
    this.title('校园服务');
    GridRow({ columns: 3, gutter: 8 }) {
      this.tile('通知', 'notices', $r('app.media.notice'));
      this.tile('课程考试', 'schedule', $r('app.media.schedule'));
      this.tile('报修', 'repair', $r('app.media.repair'));
      this.tile('失物', 'lost', $r('app.media.lost'));
      this.tile('活动', 'activity', $r('app.media.activity'));
    }
    this.subtitle('近期日程');
    ForEach(this.schedule.slice(0, 3), (item: Schedule) => { this.scheduleRow(item); }, (item: Schedule) => item.scheduleId);
    this.subtitle('通知');
    ForEach(this.notices, (n: Notice) => {
      Column({ space: 5 }) { Text(n.title).fontSize(14).fontWeight(FontWeight.Medium); Text(n.content).fontSize(12).fontColor('#64707A'); }
        .alignItems(HorizontalAlign.Start).width('100%').padding({ bottom: 12 });
    }, (n: Notice) => n.noticeId);
    this.subtitle('待办');
    this.todoList();
    Row({ space: 8 }) {
      TextInput({ placeholder: '新增待办', text: this.todo }).layoutWeight(1).onChange((v: string) => this.todo = v);
      Button('添加').enabled(!this.busy).onClick(() => { this.run(async () => { if (this.todo.trim()) { this.controller.state.todos.push(this.todo.trim()); this.todo = ''; await this.controller.save(); } }); });
    }
    this.subtitle('最近服务');
    ForEach(this.snapshot.recent.slice(-5).reverse(), (item: string) => { Text(item).fontSize(12).fontColor('#64707A'); });
  }
  @Builder tile(text: string, kind: string, asset: Resource) {
    GridCol() {
      Column({ space: 10 }) { Image(asset).width(24).height(24); Text(text).fontSize(13); }
        .width('100%').height(86).justifyContent(FlexAlign.Center).backgroundColor(Color.White).borderRadius(6)
        .onClick(() => this.selectService(kind));
    }
  }
  @Builder scheduleRow(item: Schedule) {
    Column({ space: 4 }) {
      Text(item.title + (item.kind === 'exam' ? ' · 考试' : ' · 课程')).fontSize(14);
      Text(item.startsAt + ' · ' + item.location).fontSize(11).fontColor('#64707A');
      Text(item.personal ? '个人本地日程' : '合成日程').fontSize(10).fontColor('#146551');
      if (this.page === '服务') { Button('创建本地日程提醒').fontSize(11).enabled(!this.busy).onClick(() => { this.run(async () => { this.feedback = this.snapshot.reminderPreference ? await this.native.scheduleReminder(this.context(), item.startsAt, item.title) : '提醒偏好未开启，未创建'; }); }); }
    }.width('100%').alignItems(HorizontalAlign.Start).padding({ bottom: 12 });
  }
  @Builder chat() {
    this.title('对话');
    Text('AI 无业务写权限').fontSize(12).fontColor('#146551');
    ForEach(this.snapshot.messages, (m: Message) => {
      Column({ space: 7 }) {
        Text(m.text || '正在回答…').fontSize(14).fontColor('#25303A');
        if (m.incomplete) { Text(this.streaming ? '回答中' : '回答未完成').fontSize(10).fontColor('#946318'); }
        ForEach(m.evidenceRefs, (e: Evidence) => { Text('引用 ' + e.evidenceId + '@' + e.version).fontSize(10).fontColor('#64707A'); });
        if (m.intent) { Button('进入相关服务').fontSize(12).onClick(() => this.selectService(m.intent === 'notice' ? 'notices' : m.intent)); }
      }.alignItems(HorizontalAlign.Start).width('100%').padding(12).borderRadius(6).backgroundColor(m.role === 'user' ? '#E3F1E9' : Color.White);
    });
    TextArea({ placeholder: '查询通知、日程或服务事项', text: this.input }).height(80).onChange((v: string) => this.input = v);
    Row({ space: 8 }) {
      Button('发送').enabled(!this.busy).backgroundColor('#15796E').onClick(() => { this.run(async () => this.send()); });
      Button('取消').enabled(this.streaming).backgroundColor('#64707A').onClick(() => this.controller.cancel());
    }
  }
  @Builder services() {
    this.title('服务');
    Scroll() {
      Row({ space: 8 }) {
        Button('通知').onClick(() => this.selectService('notices'));
        Button('课程考试').onClick(() => this.selectService('schedule'));
        Button('报修').onClick(() => this.selectService('repair'));
        Button('失物').onClick(() => this.selectService('lost'));
        Button('活动').onClick(() => this.selectService('activity'));
      }
    }.scrollable(ScrollDirection.Horizontal).width('100%');
    if (this.session !== 'campus-user' && this.service !== 'repair' && this.service !== 'notices') {
      Text('FORBIDDEN：社区会话不能办理此校园服务').fontSize(13).fontColor('#946318');
    } else if (this.service === 'notices') {
      ForEach(this.notices, (n: Notice) => {
        Column({ space: 6 }) { Text(n.title).fontSize(15).fontWeight(FontWeight.Bold); Text(n.content).fontSize(13); Text('来源 ' + n.sourceId + ' · ' + n.evidenceId + '@' + n.version + '\n生效 ' + n.effectiveFrom + ' · 失效 ' + (n.effectiveTo || '未设定')).fontSize(10).fontColor('#64707A'); }.width('100%').alignItems(HorizontalAlign.Start).padding(12);
      });
    } else if (this.service === 'schedule') {
      ForEach(this.schedule, (item: Schedule) => { this.scheduleRow(item); });
      Text('CSV：title,kind,location,startsAt,endsAt；kind 为 course / exam，时间含时区。文件只存本机；ICS 暂不支持。').fontSize(12).fontColor('#64707A');
      Row({ space: 8 }) {
        Button('选择并导入 CSV').enabled(!this.busy).onClick(() => { this.run(async () => { this.controller.state.personalSchedule = await chooseCsv(this.context()); await this.controller.save(); this.feedback = '已校验并保存个人本地日程，未上传'; }); });
        Button('删除导入').enabled(!this.busy).onClick(() => { this.run(async () => { this.controller.state.personalSchedule = []; await this.controller.save(); this.feedback = '个人导入已删除'; }); });
      }
    } else if (this.service === 'activity') {
      ForEach(this.snapshot.activities, (a: Activity) => {
        Column({ space: 6 }) {
          Text(a.title).fontSize(14).fontWeight(FontWeight.Bold);
          Text(a.location + ' · 场次 ' + a.session + '\n截止 ' + a.deadlineAt + ' · 余量 ' + a.remainingCapacity).fontSize(11).fontColor('#64707A');
          Button('选择报名').enabled(!this.busy).onClick(() => { this.run(async () => { const fields: Fields = { activityId: a.activityId, title: a.title, session: a.session, contactAlias: this.contact }; await this.controller.create('activity', fields); }); });
        }.width('100%').alignItems(HorizontalAlign.Start).padding({ bottom: 14 });
      });
      this.draftReview();
      this.subtitle('我的演示报名');
      if (this.signupStatus === 'error') {
        Text('报名查询失败：' + this.signupError + '。以下仅为已有回执，尚未从服务器恢复。').fontSize(12).fontColor('#A32626');
      } else if (this.signupStatus === 'loaded' && this.snapshot.signups.length === 0) {
        Text('暂无报名记录').fontSize(12).fontColor('#64707A');
      } else if (this.signupStatus === 'unknown') {
        Text('尚未查询报名记录').fontSize(12).fontColor('#64707A');
      }
      ForEach(this.snapshot.signups, (r: Receipt) => { this.receiptRow(r); });
    } else {
      this.subtitle(this.service === 'repair' ? '报修草稿' : '失物 / 拾物草稿');
      if (this.service === 'lost') {
        Select([{ value: '失物 LOST' }, { value: '拾物 FOUND' }]).selected(this.lostKind === 'LOST' ? 0 : 1).onSelect((index: number) => this.lostKind = index === 0 ? 'LOST' : 'FOUND');
        TextInput({ placeholder: '日期 YYYY-MM-DD', text: this.occurredOn }).onChange((v: string) => this.occurredOn = v);
      }
      TextInput({ placeholder: '位置', text: this.location }).onChange((v: string) => this.location = v);
      TextArea({ placeholder: this.service === 'repair' ? '问题描述' : '物品描述', text: this.description }).height(80).onChange((v: string) => this.description = v);
      TextInput({ placeholder: 'SYN-CONTACT-K', text: this.contact }).onChange((v: string) => this.contact = v);
      Button('生成草稿').enabled(!this.busy).backgroundColor('#15796E').onClick(() => { this.run(async () => this.createDraft()); });
      this.draftReview();
      if (this.service === 'repair') { this.subtitle('我的工单'); ForEach(this.snapshot.tickets, (r: Receipt) => { this.receiptRow(r); }); }
      if (this.service === 'lost') { this.subtitle('待审核演示记录'); ForEach(this.snapshot.lost, (r: Receipt) => { this.receiptRow(r); }); }
    }
    Button('刷新服务').enabled(!this.busy).onClick(() => { this.run(async () => { await this.controller.refresh(); }); });
  }
  @Builder draftReview() {
    if (this.draft) {
      Column({ space: 6 }) {
        Text('核对草稿 · ' + this.draft.draftId).fontSize(14).fontWeight(FontWeight.Bold);
        Text('修订 ' + this.draft.revision + ' · 有效至 ' + this.draft.expiresAt).fontSize(10).fontColor('#64707A');
        Text('位置：' + (this.draft.displayFields.location || '') + '\n描述：' + (this.draft.displayFields.description || this.draft.displayFields.itemDescription || '') + '\n类型 / 日期：' + (this.draft.displayFields.kind || '') + ' ' + (this.draft.displayFields.occurredOn || '') + '\n活动：' + (this.draft.displayFields.title || this.draft.displayFields.activityId || '') + '\n场次：' + (this.draft.displayFields.session || '') + '\n联系别名：' + (this.draft.displayFields.contactAlias || '')).fontSize(12);
        ForEach(this.draft.evidenceRefs || [], (e: Evidence) => { Text('依据 ' + e.evidenceId + '@' + e.version).fontSize(10).fontColor('#64707A'); });
        Button('明确确认以上内容').enabled(!this.busy).onClick(() => { this.run(async () => { if (this.draft) await this.controller.confirm(this.service, this.draft); this.feedback = '当前草稿已确认'; }); });
        if (this.confirmed) { Button('提交演示记录').enabled(!this.busy).backgroundColor('#15796E').onClick(() => { this.run(async () => { await this.controller.submit(this.service); this.feedback = '已保存合成回执，非真实学校受理'; }); }); }
      }.width('100%').alignItems(HorizontalAlign.Start).padding(12).backgroundColor('#E9F4EF').borderRadius(6);
    }
    ForEach(this.snapshot.pending.filter(p => p.kind === this.service), (p: Pending) => {
      Column({ space: 8 }) {
        Text('结果待确认 · ' + p.requestId).fontSize(11).fontColor('#946318');
        if (p.kind === 'repair') { Button('按原 requestId 查询恢复').enabled(!this.busy).onClick(() => { this.run(async () => { this.feedback = await this.controller.recoverRepair(); }); }); }
        Button('重试原幂等请求').enabled(!this.busy).onClick(() => { this.run(async () => { await this.controller.submit(p.kind); this.feedback = '已恢复合成回执'; }); });
      }.alignItems(HorizontalAlign.Start).width('100%');
    });
  }
  @Builder receiptRow(r: Receipt) {
    Column({ space: 4 }) { Text((r.ticketId || r.lostItemId || r.signupId || '') + ' · ' + r.status).fontSize(13); Text(r.displayFields?.description || r.itemDescription || r.activityId || '').fontSize(12); Text((r.session ? '场次 ' + r.session + ' · ' : '') + (r.submittedAt ? '提交 ' + r.submittedAt : '')).fontSize(10).fontColor('#64707A'); Text('合成回执 · 非真实受理').fontSize(10).fontColor('#64707A'); }.alignItems(HorizontalAlign.Start).width('100%').padding({ bottom: 10 });
  }
  @Builder todoList() {
    ForEach(this.snapshot.todos, (text: string, index: number) => {
      Row() { Text(text).fontSize(13).layoutWeight(1); Button('完成').fontSize(11).enabled(!this.busy).onClick(() => { this.run(async () => { this.controller.state.todos.splice(index, 1); await this.controller.save(); }); }); }.width('100%');
    });
  }
  @Builder profile() {
    this.title('个人');
    Text('本地演示认证：X-Demo-Session，不能用于生产登录').fontSize(12).fontColor('#64707A');
    Select([{ value: '离线合成演示' }, { value: '本地 API' }]).selected(this.mode === 'offline' ? 0 : 1).onSelect((i: number) => this.mode = i === 0 ? 'offline' : 'remote');
    Select([{ value: '校园学生 campus-user' }, { value: '社区居民 community-user' }]).selected(this.session === 'campus-user' ? 0 : 1).onSelect((i: number) => this.session = i === 0 ? 'campus-user' : 'community-user');
    TextInput({ placeholder: 'API Base URL', text: this.base }).onChange((v: string) => this.base = v);
    Button('保存连接设置').enabled(!this.busy).onClick(() => { this.run(async () => { await this.controller.configure(this.mode, this.session, this.base); }); });
    this.subtitle('本地偏好');
    Row() { Text('紧凑偏好').fontSize(13); Toggle({ type: ToggleType.Switch, isOn: this.snapshot.compact }).onChange((v: boolean) => { this.run(async () => { this.controller.state.compact = v; await this.controller.save(); }); }); }
    Row() { Text('提醒偏好').fontSize(13); Toggle({ type: ToggleType.Switch, isOn: this.snapshot.reminderPreference }).onChange((v: boolean) => { this.run(async () => { this.controller.state.reminderPreference = v; await this.controller.save(); }); }); }
    Button('清除当前会话聊天与个人导入').enabled(!this.busy).onClick(() => { this.run(async () => { this.controller.state.messages = []; this.controller.state.personalSchedule = []; await this.controller.save(); }); });
    this.subtitle('系统通知与卡片');
    Text(this.nativeStatus).fontSize(12).fontColor('#946318');
    Button('请求通知权限').enabled(!this.busy).onClick(() => { this.run(async () => { this.nativeStatus = await this.native.enableNotifications(this.context()); }); });
    Button('发送合成系统提醒').enabled(!this.busy).onClick(() => { this.run(async () => { this.nativeStatus = this.snapshot.reminderPreference ? await this.native.notify() : '提醒偏好未开启，未发送'; }); });
    Button('取消本应用日程提醒').enabled(!this.busy).onClick(() => { this.run(async () => { this.nativeStatus = await this.native.cancelReminders(this.context()); }); });
    Button('更新已添加的服务卡片').enabled(!this.busy).onClick(() => { this.run(async () => { this.nativeStatus = await this.native.updateCards(this.context(), '合成校园通知与日程 · 待办 ' + this.snapshot.todos.length); }); });
    Text('构建、权限拒绝、卡片展示及设备协同需要实际 HarmonyOS 环境验证。').fontSize(11).fontColor('#64707A');
    this.subtitle('待办'); this.todoList();
  }
  @Builder navigation() {
    Row() {
      this.nav('首页', $r('app.media.home'));
      this.nav('对话', $r('app.media.chat'));
      this.nav('服务', $r('app.media.services'));
      this.nav('个人', $r('app.media.profile'));
    }.height(64).width('100%').backgroundColor(Color.White);
  }
  @Builder nav(label: string, asset: Resource) {
    Column({ space: 5 }) { Image(asset).width(21).height(21); Text(label).fontSize(11).fontColor(this.page === label ? '#15796E' : '#64707A'); }
      .height('100%').layoutWeight(1).justifyContent(FlexAlign.Center).onClick(() => this.page = label);
  }
}
