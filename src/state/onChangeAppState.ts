import { setMainLoopModelOverride } from '../bootstrap/state.js'
import {
  clearApiKeyHelperCache,
  clearAwsCredentialsCache,
  clearGcpCredentialsCache,
} from '../utils/auth.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { toError } from '../utils/errors.js'
import { logError } from '../utils/log.js'
import { applyConfigEnvironmentVariables } from '../utils/managedEnv.js'
import {
  permissionModeFromString,
  toExternalPermissionMode,
} from '../utils/permissions/PermissionMode.js'
import {
  notifyPermissionModeChanged,
  notifySessionMetadataChanged,
  type SessionExternalMetadata,
} from '../utils/sessionState.js'
import { updateSettingsForSource } from '../utils/settings/settings.js'
import type { AppState } from './AppStateStore.js'

// 下方推送的逆操作 — 在 worker 重启时恢复。
export function externalMetadataToAppState(
  metadata: SessionExternalMetadata,
): (prev: AppState) => AppState {
  return prev => ({
    ...prev,
    ...(typeof metadata.permission_mode === 'string'
      ? {
          toolPermissionContext: {
            ...prev.toolPermissionContext,
            mode: permissionModeFromString(metadata.permission_mode),
          },
        }
      : {}),
    ...(typeof metadata.is_ultraplan_mode === 'boolean'
      ? { isUltraplanMode: metadata.is_ultraplan_mode }
      : {}),
  })
}

export function onChangeAppState({
  newState,
  oldState,
}: {
  newState: AppState
  oldState: AppState
}) {
  // toolPermissionContext.mode — CCR/SDK 模式同步的唯一枢纽点。
  //
  // 此前，模式变更仅通过 8+ 条变更路径中的 2 条中继到 CCR：
  // print.ts 中的定制 setAppState 包装器（仅无头/SDK 模式）和
  // set_permission_mode 处理器中的手动通知。
  // 所有其他路径 — Shift+Tab 循环切换、ExitPlanModePermissionRequest
  // 对话框选项、/plan 斜杠命令、回退、REPL 桥接的
  // onSetPermissionMode — 修改了 AppState 但未通知
  // CCR，导致 external_metadata.permission_mode 过时，Web UI
  // 与 CLI 的实际模式不同步。
  //
  // 在此处挂接 diff 意味着任何更改模式的 setAppState 调用都会
  // 通知 CCR（通过 notifySessionMetadataChanged → ccrClient.reportMetadata）
  // 和 SDK 状态流（通过 notifyPermissionModeChanged → 在 print.ts 中注册）。
  // 以上分散的调用点无需任何更改。
  const prevMode = oldState.toolPermissionContext.mode
  const newMode = newState.toolPermissionContext.mode
  if (prevMode !== newMode) {
    // CCR external_metadata 不得接收仅内部使用的模式名称
    //（bubble、ungated auto）。先外部化 — 如果外部模式
    // 未变化则跳过 CCR 通知（例如 default→bubble→default
    // 从 CCR 角度看是噪音，因为两者都外部化为 'default'）。
    // SDK 通道（notifyPermissionModeChanged）传递原始模式；
    // 其在 print.ts 中的监听器应用自己的过滤。
    const prevExternal = toExternalPermissionMode(prevMode)
    const newExternal = toExternalPermissionMode(newMode)
    if (prevExternal !== newExternal) {
      // Ultraplan = 仅首次计划周期。初始 control_request
      // 原子性地设置 mode 和 isUltraplanMode，因此标志的
      // 转换充当门控。根据 RFC 7396 为 null（删除该键）。
      const isUltraplan =
        newExternal === 'plan' &&
        newState.isUltraplanMode &&
        !oldState.isUltraplanMode
          ? true
          : null
      notifySessionMetadataChanged({
        permission_mode: newExternal,
        is_ultraplan_mode: isUltraplan,
      })
    }
    notifyPermissionModeChanged(newMode)
  }

  // mainLoopModel：从设置中移除？
  if (
    newState.mainLoopModel !== oldState.mainLoopModel &&
    newState.mainLoopModel === null
  ) {
    // 从设置中移除
    updateSettingsForSource('userSettings', { model: undefined })
    setMainLoopModelOverride(null)
  }

  // mainLoopModel：添加到设置中？
  if (
    newState.mainLoopModel !== oldState.mainLoopModel &&
    newState.mainLoopModel !== null
  ) {
    // 保存到设置中
    updateSettingsForSource('userSettings', { model: newState.mainLoopModel })
    setMainLoopModelOverride(newState.mainLoopModel)
  }

  // expandedView → 持久化为 showExpandedTodos + showSpinnerTree 以保持向后兼容
  if (newState.expandedView !== oldState.expandedView) {
    const showExpandedTodos = newState.expandedView === 'tasks'
    const showSpinnerTree = newState.expandedView === 'teammates'
    if (
      getGlobalConfig().showExpandedTodos !== showExpandedTodos ||
      getGlobalConfig().showSpinnerTree !== showSpinnerTree
    ) {
      saveGlobalConfig(current => ({
        ...current,
        showExpandedTodos,
        showSpinnerTree,
      }))
    }
  }

  // 详细模式
  if (
    newState.verbose !== oldState.verbose &&
    getGlobalConfig().verbose !== newState.verbose
  ) {
    const verbose = newState.verbose
    saveGlobalConfig(current => ({
      ...current,
      verbose,
    }))
  }

  // tungstenPanelVisible（仅 ant 的 tmux 面板粘性切换）
  if (process.env.USER_TYPE === 'ant') {
    if (
      newState.tungstenPanelVisible !== oldState.tungstenPanelVisible &&
      newState.tungstenPanelVisible !== undefined &&
      getGlobalConfig().tungstenPanelVisible !== newState.tungstenPanelVisible
    ) {
      const tungstenPanelVisible = newState.tungstenPanelVisible
      saveGlobalConfig(current => ({ ...current, tungstenPanelVisible }))
    }
  }

  // settings：设置变更时清除认证相关缓存
  // 确保 apiKeyHelper 和 AWS/GCP 凭据变更立即生效
  if (newState.settings !== oldState.settings) {
    try {
      clearApiKeyHelperCache()
      clearAwsCredentialsCache()
      clearGcpCredentialsCache()

      // settings.env 变更时重新应用环境变量
      // 仅追加：新增变量会添加，已有变量可能被覆盖，不会删除任何内容
      if (newState.settings.env !== oldState.settings.env) {
        applyConfigEnvironmentVariables()
      }
    } catch (error) {
      logError(toError(error))
    }
  }
}
