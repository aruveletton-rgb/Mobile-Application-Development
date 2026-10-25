import { FormExtensionAbility, formBindingData, formInfo, formProvider } from '@kit.FormKit';
import { Want } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { CardContent } from '../services/NativeCapabilities';

export default class CampusFormAbility extends FormExtensionAbility {
  onAddForm(want: Want): formBindingData.FormBindingData {
    const formId = String(want.parameters?.['ohos.extra.param.key.form_identity'] || '');
    this.remember(formId, true).catch(() => console.error('form registration failed'));
    const content: CardContent = { title: '校园服务', subtitle: '查看通知、日程与待办', status: '合成演示 · 非真实受理' };
    return formBindingData.createFormBindingData(content);
  }
  async onUpdateForm(formId: string): Promise<void> {
    try {
      const store = await preferences.getPreferences(this.context, { name: 'campus-card-v1' });
      const value = await store.get('content', '');
      const content: CardContent = typeof value === 'string' && value.length > 0 ? JSON.parse(value) as CardContent : { title: '校园服务', subtitle: '合成通知与日程', status: '合成演示 · 非真实受理' };
      await formProvider.updateForm(formId, formBindingData.createFormBindingData(content));
    } catch (e) { console.error('form update unavailable'); }
  }
  onRemoveForm(formId: string): void { this.remember(formId, false).catch(() => console.error('form removal failed')); }
  onCastToNormalForm(formId: string): void { this.remember(formId, true).catch(() => console.error('form cast failed')); }
  private async remember(id: string, add: boolean): Promise<void> {
    if (!id) return;
    const store = await preferences.getPreferences(this.context, { name: 'campus-card-v1' });
    const ids = JSON.parse(String(await store.get('formIds', '[]'))) as string[];
    const next = ids.filter(value => value !== id); if (add) next.push(id);
    await store.put('formIds', JSON.stringify(next)); await store.flush();
  }
}
