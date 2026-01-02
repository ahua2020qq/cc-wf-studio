/**
 * Claude Code Workflow Studio - Load Workflow Command
 *
 * Loads a specific workflow file and sends it to the Webview
 */

import type { Webview } from 'vscode';
import type { LoadWorkflowPayload } from '../../shared/types/messages';
import type { FileService } from '../services/file-service';
import { migrateWorkflow } from '../utils/migrate-workflow';
import offlineConfig from '../../config/offline.config.js';

/**
 * Load a specific workflow and send to webview
 *
 * @param fileService - File service instance
 * @param webview - Webview to send response to
 * @param workflowId - Workflow ID (filename without .json extension)
 * @param requestId - Request ID for response matching
 */
export async function loadWorkflow(
  fileService: FileService,
  webview: Webview,
  workflowId: string,
  requestId?: string
): Promise<void> {
  try {
    // [yougao 改造] 从多个存储位置查找工作流文件
    let filePath = '';
    let foundIn = '';
    
    // 1. 首先在当前存储目录查找
    const currentFilePath = fileService.getWorkflowFilePath(workflowId);
    if (await fileService.fileExists(currentFilePath)) {
      filePath = currentFilePath;
      foundIn = 'current';
    }
    // 2. 如果在离线模式，也检查离线目录
    else if (offlineConfig.isOffline) {
      const offlineFilePath = fileService.getOfflineWorkflowFilePath(workflowId);
      if (await fileService.fileExists(offlineFilePath)) {
        filePath = offlineFilePath;
        foundIn = 'offline';
      }
    }
    // 3. 如果还没找到，检查工作区目录（兼容旧版本）
    else {
      const workspaceFilePath = fileService.getWorkflowFilePath(workflowId);
      if (await fileService.fileExists(workspaceFilePath)) {
        filePath = workspaceFilePath;
        foundIn = 'workspace';
      }
    }

    // Check if file was found
    if (!filePath) {
      webview.postMessage({
        type: 'ERROR',
        requestId,
        payload: {
          code: 'LOAD_FAILED',
          message: `Workflow "${workflowId}" not found in any storage location`,
        },
      });
      return;
    }

    // Read and parse workflow file
    const content = await fileService.readFile(filePath);
    const parsedWorkflow = JSON.parse(content);

    // Apply migrations for backward compatibility
    const workflow = migrateWorkflow(parsedWorkflow);

    // Send success response
    const payload: LoadWorkflowPayload = { workflow };
    webview.postMessage({
      type: 'LOAD_WORKFLOW',
      requestId,
      payload,
    });

    console.log(`[yougao] Workflow loaded: ${workflowId} (from: ${foundIn}, offline: ${offlineConfig.isOffline})`);
  } catch (error) {
    // Send error response
    webview.postMessage({
      type: 'ERROR',
      requestId,
      payload: {
        code: 'LOAD_FAILED',
        message: error instanceof Error ? error.message : 'Failed to load workflow',
        details: error,
      },
    });
  }
}
