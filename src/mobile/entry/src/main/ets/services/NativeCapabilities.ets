import { notificationManager } from '@kit.NotificationKit';
import { abilityAccessCtrl, common } from '@kit.AbilityKit';
import { reminderAgentManager } from '@kit.BackgroundTasksKit';
import { preferences } from '@kit.ArkData';
import { formBindingData, formProvider } from '@kit.FormKit';

export interface CardContent { title: string; subtitle: string; status: string; }
export class NativeCapabilities {
  async scheduleReminder(context: common.UIAbilityContext, startsAt: string, title: string): Promise<string> {
    try {
      const permission = await abilityAccessCtrl.createAtManager().requestPermissionsFromUser(context, ['ohos.permission.PUBLISH_AGENT_REMINDER']);
      if (permission.authResults[0] !== 0) return '日程提醒权限被拒绝，未创建提醒';
      const date = new Date(startsAt);
      if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) return '日程时间无效或已过去，未创建提醒';
      const request: reminderAgentManager.ReminderRequestCalendar = {
        reminderType: reminderAgentManager.ReminderType.REMINDER_TYPE_CALENDAR,
        dateTime: { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes() },
        title: '校园智能助手 · 本地日程提醒', content: title, expiredContent: '日程提醒已到期', notificationId: 1002,
        slotType: notificationManager.SlotType.SERVICE_INFORMATION
      };
      const id = await reminderAgentManager.publishReminder(request);
      const store = await preferences.getPreferences(context, { name: 'campus-reminders-v1' });
      const ids = JSON.parse(String(await store.get('ids', '[]'))) as number[]; ids.push(id);
      await store.put('ids', JSON.stringify(ids)); await store.flush();
      return '系统接受本地日程提醒请求，触发与展示待设备核验';
    } catch (e) { return '日程提醒权限或系统能力不可用，未确认创建成功'; }
  }
  async cancelReminders(context: common.UIAbilityContext): Promise<string> {
    try {
      const store = await preferences.getPreferences(context, { name: 'campus-reminders-v1' });
      const ids = JSON.parse(String(await store.get('ids', '[]'))) as number[];
      for (const id of ids) await reminderAgentManager.cancelReminder(id);
      await store.put('ids', '[]'); await store.flush(); return '已取消本应用记录的本地日程提醒';
    } catch (e) { return '提醒取消失败或不可用，结果未确认'; }
  }
  async enableNotifications(context: common.UIAbilityContext): Promise<string> {
    try {
      if (!await notificationManager.isNotificationEnabled()) await notificationManager.requestEnableNotification(context);
      return await notificationManager.isNotificationEnabled() ? '系统通知权限已允许（尚未发送）' : '通知权限被拒绝，可继续使用页面';
    } catch (e) { return '通知权限被拒绝或系统不可用，可继续使用页面'; }
  }
  async notify(): Promise<string> {
    try {
      if (!await notificationManager.isNotificationEnabled()) return '通知权限未允许，未发送';
      const request: notificationManager.NotificationRequest = { id: 1001, content: { notificationContentType: notificationManager.ContentType.NOTIFICATION_CONTENT_BASIC_TEXT, normal: { title: '校园智能助手 · 合成提醒', text: '合成日程提醒，非教务实时通知', additionalText: '本地课程原型' } } };
      await notificationManager.publish(request); return '系统接受合成通知发布请求，实际展示待设备核验';
    } catch (e) { return '通知发布失败或系统不可用，未确认送达'; }
  }
  async updateCards(context: common.UIAbilityContext, subtitle: string): Promise<string> {
    try {
      const store = await preferences.getPreferences(context, { name: 'campus-card-v1' });
      const content: CardContent = { title: '校园服务', subtitle, status: '合成演示 · 非真实受理' };
      await store.put('content', JSON.stringify(content)); await store.flush();
      const value = await store.get('formIds', '[]'); const ids = JSON.parse(String(value)) as string[];
      if (ids.length === 0) return '尚未添加桌面卡片；请从系统卡片管理添加';
      for (const id of ids) await formProvider.updateForm(id, formBindingData.createFormBindingData(content));
      return `已提交 ${ids.length} 个卡片更新请求，展示待设备核验`;
    } catch (e) { return '卡片更新失败或系统不可用'; }
  }
}
