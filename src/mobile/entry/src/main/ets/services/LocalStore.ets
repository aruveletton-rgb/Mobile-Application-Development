import { preferences } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';
import { ClientSnapshot, freshSnapshot } from '../model/Models';

export class LocalStore {
  private store: preferences.Preferences | null = null;
  async open(context: common.UIAbilityContext): Promise<void> { this.store = await preferences.getPreferences(context, { name: 'campus-client-v2' }); }
  async load(scope: string): Promise<ClientSnapshot> {
    if (!this.store) throw new Error('本地存储尚未初始化');
    const value = await this.store.get(scope, '');
    if (typeof value !== 'string' || value.length === 0) return freshSnapshot();
    return JSON.parse(value) as ClientSnapshot;
  }
  async save(scope: string, snapshot: ClientSnapshot): Promise<void> {
    if (!this.store) throw new Error('本地存储不可用，状态未保存');
    await this.store.put(scope, JSON.stringify(snapshot)); await this.store.flush();
  }
  async setting(key: string, fallback: string): Promise<string> { if (!this.store) return fallback; const value = await this.store.get(key, fallback); return typeof value === 'string' ? value : fallback; }
  async setSetting(key: string, value: string): Promise<void> { if (!this.store) throw new Error('存储不可用'); await this.store.put(key, value); await this.store.flush(); }
}
