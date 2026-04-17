import chalk from 'chalk';
import React, { type ReactNode, useCallback, useState } from 'react';
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from '../../../../services/analytics/index.js';
import { useSetAppState } from '../../../../state/AppState.js';
import type { Tools } from '../../../../Tool.js';
import type { AgentDefinition } from '../../../../tools/AgentTool/loadAgentsDir.js';
import { getActiveAgentsFromList } from '../../../../tools/AgentTool/loadAgentsDir.js';
import { editFileInEditor } from '../../../../utils/promptEditor.js';
import { useWizard } from '../../../wizard/index.js';
import { getNewAgentFilePath, saveAgentToFile } from '../../agentFileUtils.js';
import type { AgentWizardData } from '../types.js';
import { ConfirmStep } from './ConfirmStep.js';
type Props = {
  tools: Tools;
  existingAgents: AgentDefinition[];
  onComplete: (message: string) => void;
};
export function ConfirmStepWrapper({
  tools,
  existingAgents,
  onComplete
}: Props): ReactNode {
  const {
    wizardData
  } = useWizard<AgentWizardData>();
  const [saveError, setSaveError] = useState<string | null>(null);
  const setAppState = useSetAppState();
  const saveAgent = useCallback(async (openInEditor: boolean): Promise<void> => {
    if (!wizardData?.finalAgent) return;
    try {
      await saveAgentToFile(wizardData.location!, wizardData.finalAgent.agentType, wizardData.finalAgent.whenToUse, wizardData.finalAgent.tools, wizardData.finalAgent.getSystemPrompt(), true, wizardData.finalAgent.color, wizardData.finalAgent.model, wizardData.finalAgent.memory);
      setAppState(state => {
        if (!wizardData.finalAgent) return state;
        const allAgents = state.agentDefinitions.allAgents.concat(wizardData.finalAgent);
        return {
          ...state,
          agentDefinitions: {
            ...state.agentDefinitions,
            activeAgents: getActiveAgentsFromList(allAgents),
            allAgents
          }
        };
      });
      if (openInEditor) {
        const filePath = getNewAgentFilePath({
          source: wizardData.location!,
          agentType: wizardData.finalAgent.agentType
        });
        await editFileInEditor(filePath);
      }
      logEvent('tengu_agent_created', {
        agent_type: wizardData.finalAgent.agentType,
        generation_method: wizardData.wasGenerated ? 'generated' : 'manual',
        source: wizardData.location!,
        tool_count: wizardData.finalAgent.tools?.length ?? 'all',
        has_custom_model: !!wizardData.finalAgent.model,
        has_custom_color: !!wizardData.finalAgent.color,
        has_memory: !!wizardData.finalAgent.memory,
        memory_scope: wizardData.finalAgent.memory ?? 'none',
        ...(openInEditor ? {
          opened_in_editor: true
        } : {})
      } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS);
      const message = openInEditor ? `已创建智能体：${chalk.bold(wizardData.finalAgent.agentType)} 并已在编辑器中打开。` + `如果您进行了修改，请重新启动以加载最新版本。` : `已创建智能体：${chalk.bold(wizardData.finalAgent.agentType)}`;
      onComplete(message);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "保存智能体失败");
    }
  }, [wizardData, onComplete, setAppState]);
  const handleSave = useCallback(() => saveAgent(false), [saveAgent]);
  const handleSaveAndEdit = useCallback(() => saveAgent(true), [saveAgent]);
  return <ConfirmStep tools={tools} existingAgents={existingAgents} onSave={handleSave} onSaveAndEdit={handleSaveAndEdit} error={saveError} />;
}
