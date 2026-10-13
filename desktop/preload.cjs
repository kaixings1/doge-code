/**
 * WorkBuddy Local Proxy 桌面端 — 预加载脚本
 *
 * 通过 contextBridge 暴露受控的 IPC 接口；渲染层不接触 Node。
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workbuddyDesktop', {
  // 会话（edition: 'cn'=国内版 / 'intl'=国际版；mode: 'embedded'=内嵌窗口 / 'external'=系统浏览器）
  getState: () => ipcRenderer.invoke('session:get-state'),
  startLogin: (edition, mode) => ipcRenderer.invoke('session:start-login', edition, mode),
  getLoginState: () => ipcRenderer.invoke('session:login-state'),
  cancelLogin: () => ipcRenderer.invoke('session:cancel-login'),
  onLoginState: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('login:state', listener);
    return () => ipcRenderer.removeListener('login:state', listener);
  },
  refreshSession: () => ipcRenderer.invoke('session:refresh'),
  logout: () => ipcRenderer.invoke('session:logout'),
  // 配置
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: payload => ipcRenderer.invoke('config:save', payload),
  // 多账号
  switchAccount: id => ipcRenderer.invoke('accounts:switch', id),
  refreshAccountToken: id => ipcRenderer.invoke('accounts:refresh-token', id || null),
  removeAccount: id => ipcRenderer.invoke('accounts:remove', id),
  uploadAccount: (name, fileText, edition) => ipcRenderer.invoke('accounts:upload', name, fileText, edition),
  // 积分 / 签到（当前账号）
  getUsage: () => ipcRenderer.invoke('billing:usage'),
  getCheckinStatus: () => ipcRenderer.invoke('billing:checkin-status'),
  claimCheckin: () => ipcRenderer.invoke('billing:checkin'),
  // 多账号批量积分 / 签到
  getAllBalances: () => ipcRenderer.invoke('accounts:usage'),
  checkinAllAccounts: id => ipcRenderer.invoke('accounts:checkin', id || null),
  // 敏感词脱敏（词表维护 / 开关 / 命中统计）
  getDesensitize: () => ipcRenderer.invoke('desensitize:get'),
  setDesensitizeEnabled: enabled => ipcRenderer.invoke('desensitize:set-enabled', enabled),
  setDesensitizeRoles: roles => ipcRenderer.invoke('desensitize:set-roles', roles),
  saveDesensitizeTerms: terms => ipcRenderer.invoke('desensitize:set-terms', terms),
  addDesensitizeTerms: terms => ipcRenderer.invoke('desensitize:add-terms', terms),
  removeDesensitizeTerm: term => ipcRenderer.invoke('desensitize:remove-term', term),
  resetDesensitizeTerms: () => ipcRenderer.invoke('desensitize:reset'),
  resetDesensitizeStats: () => ipcRenderer.invoke('desensitize:reset-stats'),
  // 请求加工管线（stage 开关 / 聚合统计）
  getPipeline: () => ipcRenderer.invoke('pipeline:get'),
  setPipelineStage: (stage, enabled) => ipcRenderer.invoke('pipeline:set-stage', stage, enabled),
  resetPipelineStats: () => ipcRenderer.invoke('pipeline:reset-stats'),
  // 运行日志（系统事件 / 筛选 / 导出 / 清空）
  getLogs: query => ipcRenderer.invoke('logs:get', query),
  getLogStats: () => ipcRenderer.invoke('logs:stats'),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),
  exportLogs: () => ipcRenderer.invoke('logs:export'),
  // 事件
  onStateChanged: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('accounts:state-changed', listener);
    return () => ipcRenderer.removeListener('accounts:state-changed', listener);
  },
  onAutoMaintained: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('accounts:auto-maintained', listener);
    return () => ipcRenderer.removeListener('accounts:auto-maintained', listener);
  },
});
