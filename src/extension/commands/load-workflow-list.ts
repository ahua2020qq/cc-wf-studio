/**
 * Claude Code Workflow Studio - Load Workflow List Command
 *
 * Loads list of available workflows from .vscode/workflows/ directory
 */

import type { Webview } from 'vscode';
import * as vscode from 'vscode';
import type { WorkflowListPayload } from '../../shared/types/messages';
import type { FileService } from '../services/file-service';
import offlineConfig from '../../config/offline.config.js';

/**
 * Load workflow list and send to webview
 *
 * @param fileService - File service instance
 * @param webview - Webview to send response to
 * @param requestId - Request ID for response matching
 */
export async function loadWorkflowList(
  fileService: FileService,
  webview: Webview,
  requestId?: string
): Promise<void> {
  try {
    // [yougao 改造] 从多个存储位置加载工作流列表
    const workflows: Array<{
      id: string;
      name: string;
      description?: string;
      updatedAt: string;
      source?: string;
    }> = [];
    const processedFiles = new Set<string>(); // 避免重复

    // 1. 从当前存储目录加载
    await loadWorkflowsFromDirectory(fileService, workflows, processedFiles, 'current');
    
    // 2. 如果在离线模式，也从离线目录加载
    if (offlineConfig.isOffline) {
      await loadWorkflowsFromDirectory(fileService, workflows, processedFiles, 'offline');
    }
    
    // 3. 从工作区目录加载（兼容旧版本）
    await loadWorkflowsFromDirectory(fileService, workflows, processedFiles, 'workspace');

    // 按更新时间排序（最新的在前）
    workflows.sort((a, b) => {
      const dateA = new Date(a.updatedAt).getTime();
      const dateB = new Date(b.updatedAt).getTime();
      return dateB - dateA;
    });

    // 移除 source 字段，因为 WorkflowListPayload 不需要它
    const payloadWorkflows = workflows.map(({ source, ...rest }) => rest);

    // Send success response
    const payload: WorkflowListPayload = { workflows: payloadWorkflows };
    webview.postMessage({
      type: 'WORKFLOW_LIST_LOADED',
      requestId,
      payload,
    });

    console.log(`[yougao] Workflow list loaded: ${workflows.length} workflows (offline: ${offlineConfig.isOffline})`);
  } catch (error) {
    // Send error response
    webview.postMessage({
      type: 'ERROR',
      requestId,
      payload: {
        code: 'LOAD_FAILED',
        message: error instanceof Error ? error.message : 'Failed to load workflow list',
        details: error,
      },
    });
  }
}

/**
 * [yougao 改造] 从指定目录加载工作流文件
 */
async function loadWorkflowsFromDirectory(
  fileService: FileService,
  workflows: Array<{ id: string; name: string; description?: string; updatedAt: string; source?: string }>,
  processedFiles: Set<string>,
  directoryType: 'current' | 'offline' | 'workspace'
): Promise<void> {
  try {
    let directoryPath: string;
    
    switch (directoryType) {
      case 'current':
        directoryPath = fileService.getWorkflowsDirectory();
        break;
      case 'offline':
        directoryPath = fileService.getOfflineWorkflowsDirectory();
        break;
      case 'workspace':
        directoryPath = fileService.getWorkflowsDirectory(); // 使用原始工作区目录
        break;
      default:
        return;
    }

    const uri = vscode.Uri.file(directoryPath);
    let files: [string, vscode.FileType][] = [];
    
    try {
      files = await vscode.workspace.fs.readDirectory(uri);
    } catch (error) {
      // Directory doesn't exist or is empty
      console.log(`[yougao] No ${directoryType} workflows directory or empty:`, directoryPath);
      return;
    }

    // Filter JSON files and load metadata
    for (const [filename, fileType] of files) {
      if (fileType === vscode.FileType.File && filename.endsWith('.json')) {
        const workflowId = filename.replace('.json', '');
        
        // 避免重复处理相同文件
        if (processedFiles.has(workflowId)) {
          continue;
        }
        
        try {
          let filePath: string;
          if (directoryType === 'offline') {
            filePath = fileService.getOfflineWorkflowFilePath(workflowId);
          } else {
            filePath = fileService.getWorkflowFilePath(workflowId);
          }
          
          const content = await fileService.readFile(filePath);
          const workflow = JSON.parse(content);

          workflows.push({
            id: workflowId,
            name: workflow.name || workflowId,
            description: workflow.description,
            updatedAt: workflow.updatedAt || new Date().toISOString(),
            source: directoryType // 添加来源信息
          });
          
          processedFiles.add(workflowId);
        } catch (error) {
          console.error(`[yougao] Failed to parse workflow file ${filename} from ${directoryType}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`[yougao] Error loading workflows from ${directoryType}:`, error);
  }
}
