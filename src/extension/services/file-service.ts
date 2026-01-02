/**
 * Claude Code Workflow Studio - File Service
 *
 * Handles file system operations using VSCode workspace.fs API
 * Based on: /specs/001-cc-wf-studio/contracts/vscode-extension-api.md section 2
 */

import * as path from 'node:path';
import * as vscode from 'vscode';
import * as os from 'node:os';
import offlineConfig from '../../config/offline.config.js';

/**
 * File Service for managing workflow files
 */
export class FileService {
  private readonly workspacePath: string;
  private readonly workflowsDirectory: string;
  private readonly offlineWorkflowsDirectory: string;

  constructor() {
    // Get workspace root path
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder is open');
    }

    this.workspacePath = workspaceFolders[0].uri.fsPath;
    this.workflowsDirectory = path.join(this.workspacePath, '.vscode', 'workflows');
    
    // [yougao 改造] 离线模式存储目录
    const localStoragePath = offlineConfig.localStoragePath;
    this.offlineWorkflowsDirectory = this.resolveLocalStoragePath(localStoragePath);
  }

  /**
   * [yougao 改造] 解析本地存储路径（支持 ~ 扩展）
   */
  private resolveLocalStoragePath(localStoragePath: string): string {
    if (localStoragePath.startsWith('~/') || localStoragePath === '~') {
      const homeDir = os.homedir();
      return path.join(homeDir, localStoragePath.slice(2));
    }
    return localStoragePath;
  }

  /**
   * [yougao 改造] 获取当前存储目录（根据离线模式配置）
   */
  getCurrentStorageDirectory(): string {
    if (offlineConfig.isOffline) {
      console.log('[yougao 离线模式] 使用本地存储目录:', this.offlineWorkflowsDirectory);
      return this.offlineWorkflowsDirectory;
    }
    return this.workflowsDirectory;
  }

  /**
   * Ensure the workflows directory exists
   */
  async ensureWorkflowsDirectory(): Promise<void> {
    const storageDir = this.getCurrentStorageDirectory();
    await this.ensureDirectory(storageDir);
  }

  /**
   * [yougao 改造] 处理文件操作异常
   */
  private handleFileError(operation: string, filePath: string, error: unknown): never {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[yougao 文件操作错误] ${operation} 失败: ${filePath}`, error);
    throw new Error(`[yougao] ${operation} 失败: ${errorMessage}`);
  }

  /**
   * Read a file from the file system
   *
   * @param filePath - Absolute file path
   * @returns File content as string
   */
  async readFile(filePath: string): Promise<string> {
    try {
      const uri = vscode.Uri.file(filePath);
      const bytes = await vscode.workspace.fs.readFile(uri);
      console.log(`[yougao] 读取文件: ${filePath} (${bytes.length} bytes)`);
      return Buffer.from(bytes).toString('utf-8');
    } catch (error) {
      this.handleFileError('读取文件', filePath, error);
    }
  }

  /**
   * Write content to a file
   *
   * @param filePath - Absolute file path
   * @param content - File content to write
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const bytes = Buffer.from(content, 'utf-8');
      await vscode.workspace.fs.writeFile(uri, bytes);
      console.log(`[yougao] 写入文件: ${filePath} (${bytes.length} bytes)`);
    } catch (error) {
      this.handleFileError('写入文件', filePath, error);
    }
  }

  /**
   * Check if a file exists
   *
   * @param filePath - Absolute file path
   * @returns True if file exists, false otherwise
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(filePath);
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a directory
   *
   * @param dirPath - Absolute directory path
   */
  async createDirectory(dirPath: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(dirPath);
      await vscode.workspace.fs.createDirectory(uri);
      console.log(`[yougao] 创建目录: ${dirPath}`);
    } catch (error) {
      this.handleFileError('创建目录', dirPath, error);
    }
  }

  /**
   * [yougao 改造] 安全地创建目录（如果不存在）
   */
  async ensureDirectory(dirPath: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(dirPath);
      await vscode.workspace.fs.stat(uri);
      // Directory exists
    } catch {
      // Directory doesn't exist, create it
      await this.createDirectory(dirPath);
    }
  }

  /**
   * Get the workflows directory path
   */
  getWorkflowsDirectory(): string {
    return this.getCurrentStorageDirectory();
  }

  /**
   * [yougao 改造] 获取离线存储目录路径
   */
  getOfflineWorkflowsDirectory(): string {
    return this.offlineWorkflowsDirectory;
  }

  /**
   * Get the workspace root path
   */
  getWorkspacePath(): string {
    return this.workspacePath;
  }

  /**
   * Get the full path for a workflow file
   *
   * @param workflowName - Workflow name (without .json extension)
   * @returns Full file path
   */
  getWorkflowFilePath(workflowName: string): string {
    const storageDir = this.getCurrentStorageDirectory();
    return path.join(storageDir, `${workflowName}.json`);
  }

  /**
   * [yougao 改造] 获取离线模式下的工作流文件路径
   */
  getOfflineWorkflowFilePath(workflowName: string): string {
    return path.join(this.offlineWorkflowsDirectory, `${workflowName}.json`);
  }

  /**
   * List all workflow files in the workflows directory
   *
   * @returns Array of workflow file names (without .json extension)
   */
  async listWorkflowFiles(): Promise<string[]> {
    const storageDir = this.getCurrentStorageDirectory();
    const uri = vscode.Uri.file(storageDir);

    try {
      const entries = await vscode.workspace.fs.readDirectory(uri);
      return entries
        .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.json'))
        .map(([name]) => name.replace(/\.json$/, ''));
    } catch {
      // Directory doesn't exist yet
      return [];
    }
  }

  /**
   * [yougao 改造] 列出所有存储位置的工作流文件（工作区 + 离线目录）
   */
  async listAllWorkflowFiles(): Promise<{ workspace: string[], offline: string[] }> {
    const workspaceFiles = await this.listWorkflowFilesFromDirectory(this.workflowsDirectory);
    const offlineFiles = await this.listWorkflowFilesFromDirectory(this.offlineWorkflowsDirectory);
    
    return {
      workspace: workspaceFiles,
      offline: offlineFiles
    };
  }

  /**
   * [yougao 改造] 从指定目录列出工作流文件
   */
  private async listWorkflowFilesFromDirectory(directory: string): Promise<string[]> {
    const uri = vscode.Uri.file(directory);

    try {
      const entries = await vscode.workspace.fs.readDirectory(uri);
      return entries
        .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.json'))
        .map(([name]) => name.replace(/\.json$/, ''));
    } catch {
      // Directory doesn't exist yet
      return [];
    }
  }
}
