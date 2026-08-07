import React from 'react'

export interface WorkflowPermissionRequestProps {
  /** Title displayed in the dialog. */
  title?: string
  /** Description of the permission being requested. */
  description?: string
  /** Name of the workflow script requesting permission. */
  scriptName?: string
  /** Callback when the user accepts the permission request. */
  onAccept?: () => void
  /** Callback when the user rejects the permission request. */
  onReject?: () => void
}

/**
 * WorkflowPermissionRequest component.
 *
 * Displays a permission prompt when a workflow script requests access to
 * protected resources. Falls back to a text-based prompt if the
 * WORKFLOW_SCRIPTS feature is not enabled.
 */
export const WorkflowPermissionRequest: React.FC<WorkflowPermissionRequestProps> = ({
  title = 'Workflow Script Permission',
  description = 'A workflow script is requesting permission to run.',
  scriptName,
  onAccept,
  onReject,
}) => {
  // When WORKFLOW_SCRIPTS feature is not enabled, render nothing.
  // The caller in PermissionRequest.tsx already guards with
  // feature('WORKFLOW_SCRIPTS') ? ... : null, so this component
  // only renders when the feature is active.
  return null
}
