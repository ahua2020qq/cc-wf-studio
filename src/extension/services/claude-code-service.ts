/**
 * Claude Code CLI Service
 *
 * Executes Claude Code CLI commands for AI-assisted workflow generation.
 * Based on: /specs/001-ai-workflow-generation/research.md Q1
 *
 * Updated to use nano-spawn for cross-platform compatibility (Windows/Unix)
 * See: Issue #79 - Windows environment compatibility
 */

import type { ChildProcess } from 'node:child_process';
import nanoSpawn from 'nano-spawn';
import type { ClaudeModel } from '../../shared/types/messages';
import { log } from '../extension';

/**
 * nano-spawn type definitions (manually defined for compatibility)
 */
interface SubprocessError extends Error {
  stdout: string;
  stderr: string;
  output: string;
  command: string;
  durationMs: number;
  exitCode?: number;
  signalName?: string;
  isTerminated?: boolean;
  code?: string;
}

interface Result {
  stdout: string;
  stderr: string;
  output: string;
  command: string;
  durationMs: number;
}

interface Subprocess extends Promise<Result> {
  // nano-spawn v2.0.0: nodeChildProcess is a Promise that resolves to ChildProcess
  // (spawnSubprocess is an async function)
  nodeChildProcess: Promise<ChildProcess>;
  stdout: AsyncIterable<string>;
  stderr: AsyncIterable<string>;
}

const spawn =
  nanoSpawn.default ||
  (nanoSpawn as (
    file: string,
    args?: readonly string[],
    options?: Record<string, unknown>
  ) => Subprocess);

/**
 * Active generation processes
 * Key: requestId, Value: subprocess and start time
 */
const activeProcesses = new Map<string, { subprocess: Subprocess; startTime: number }>();

/**
 * Check if claude command is directly available in PATH
 * Checks every time to handle dynamic PATH changes
 *
 * @returns true if claude is available, false if npx should be used
 */
async function isClaudeCommandAvailable(): Promise<boolean> {
  // [yougao 改造] 跳过 Claude CLI 校验，强制返回 true 以支持离线模式
  console.log('[yougao] 跳过 Claude CLI 校验');
  log('INFO', '[yougao] 跳过 Claude CLI 校验，强制返回 true');
  return true;
}

/**
 * Get the command and args for spawning Claude CLI
 * Uses 'claude' directly if available, otherwise falls back to 'npx claude'
 *
 * @param args - CLI arguments (without 'claude' command itself)
 * @returns command and args for spawn
 */
async function getClaudeSpawnCommand(args: string[]): Promise<{ command: string; args: string[] }> {
  const useDirectClaude = await isClaudeCommandAvailable();

  if (useDirectClaude) {
    return { command: 'claude', args };
  }
  return { command: 'npx', args: ['claude', ...args] };
}

export interface ClaudeCodeExecutionResult {
  success: boolean;
  output?: string;
  error?: {
    code: 'COMMAND_NOT_FOUND' | 'TIMEOUT' | 'PARSE_ERROR' | 'UNKNOWN_ERROR';
    message: string;
    details?: string;
  };
  executionTimeMs: number;
}

/**
 * Map ClaudeModel type to Claude CLI model alias
 * See: https://code.claude.com/docs/en/model-config.md
 */
function getCliModelName(model: ClaudeModel): string {
  // Claude CLI accepts model aliases: 'sonnet', 'opus', 'haiku'
  return model;
}

/**
 * Execute Claude Code CLI with a prompt and return the output
 *
 * @param prompt - The prompt to send to Claude Code CLI
 * @param timeoutMs - Timeout in milliseconds (default: 60000)
 * @param requestId - Optional request ID for cancellation support
 * @param workingDirectory - Working directory for CLI execution (defaults to current directory)
 * @param model - Claude model to use (default: 'sonnet')
 * @param allowedTools - Optional array of allowed tool names (e.g., ['Read', 'Grep', 'Glob'])
 * @returns Execution result with success status and output/error
 */
export async function executeClaudeCodeCLI(
  prompt: string,
  timeoutMs = 60000,
  requestId?: string,
  workingDirectory?: string,
  model: ClaudeModel = 'sonnet',
  allowedTools?: string[]
): Promise<ClaudeCodeExecutionResult> {
  const startTime = Date.now();

  // [yougao 改造] 离线模式占位返回，跳过 Claude CLI 调用
  console.log('[yougao] 离线模式：跳过 Claude CLI 调用，返回模拟数据');
  log('INFO', '[yougao] 离线模式：跳过 Claude CLI 调用，返回模拟数据', {
    promptLength: prompt.length,
    timeoutMs,
    model,
    allowedTools,
    cwd: workingDirectory ?? process.cwd(),
  });

  // 模拟处理时间
  const executionTimeMs = Math.min(Date.now() - startTime, 1000);

  // 返回模拟成功结果
  return {
    success: true,
    output: JSON.stringify({
      status: 'success',
      message: '[yougao 离线模式] 工作流已处理完成',
      values: {
        workflow: {
          name: 'offline-workflow',
          description: '离线模式生成的工作流',
          nodes: [],
          edges: []
        }
      }
    }),
    executionTimeMs,
  };
}

/**
 * Type guard to check if an error is a SubprocessError from nano-spawn
 *
 * @param error - The error to check
 * @returns True if error is a SubprocessError
 */
function isSubprocessError(error: unknown): error is SubprocessError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'exitCode' in error &&
    'stderr' in error &&
    'stdout' in error
  );
}

/**
 * Parse JSON output from Claude Code CLI
 *
 * Handles multiple output formats:
 * 1. Markdown-wrapped: ```json { ... } ```
 * 2. Raw JSON: { ... }
 * 3. Text with embedded JSON block: "Some text...\n```json\n{...}\n```"
 *
 * Note: Uses string position-based extraction (not regex) to handle cases
 * where the JSON content itself contains markdown code blocks.
 *
 * @param output - Raw output string from CLI
 * @returns Parsed JSON object or null if parsing fails
 */
export function parseClaudeCodeOutput(output: string): unknown {
  try {
    const trimmed = output.trim();

    // Strategy 1: If wrapped in ```json...```, remove outer markers only
    if (trimmed.startsWith('```json') && trimmed.endsWith('```')) {
      const jsonContent = trimmed
        .slice(7) // Remove ```json
        .slice(0, -3) // Remove trailing ```
        .trim();
      return JSON.parse(jsonContent);
    }

    // Strategy 2: Try parsing as-is (raw JSON)
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed);
    }

    // Strategy 3: Find ```json block within text (e.g., explanation + JSON)
    const jsonBlockStart = trimmed.indexOf('```json');
    if (jsonBlockStart !== -1) {
      // Find the closing ``` after the json block
      const contentStart = jsonBlockStart + 7; // Skip ```json
      const jsonBlockEnd = trimmed.lastIndexOf('```');
      if (jsonBlockEnd > contentStart) {
        const jsonContent = trimmed.slice(contentStart, jsonBlockEnd).trim();
        return JSON.parse(jsonContent);
      }
    }

    // Strategy 4: Try parsing as-is (fallback)
    return JSON.parse(trimmed);
  } catch (_error) {
    // If parsing fails, return null
    return null;
  }
}

/**
 * Cancel an active generation process
 *
 * @param requestId - Request ID of the generation to cancel
 * @returns True if process was found and killed, false otherwise
 */
export async function cancelGeneration(requestId: string): Promise<{
  cancelled: boolean;
  executionTimeMs?: number;
}> {
  const activeGen = activeProcesses.get(requestId);

  if (!activeGen) {
    log('WARN', `No active generation found for requestId: ${requestId}`);
    return { cancelled: false };
  }

  const { subprocess, startTime } = activeGen;
  const executionTimeMs = Date.now() - startTime;

  // nano-spawn v2.0.0: nodeChildProcess is a Promise that resolves to ChildProcess
  // We need to await it before calling kill()
  const childProcess = await subprocess.nodeChildProcess;

  log('INFO', `Cancelling generation for requestId: ${requestId}`, {
    pid: childProcess.pid,
    elapsedMs: executionTimeMs,
  });

  // Kill the process (cross-platform compatible)
  // On Windows: kill() sends an unconditional termination
  // On Unix: kill() sends SIGTERM (graceful termination)
  childProcess.kill();

  // Force kill after 500ms if process doesn't terminate
  setTimeout(() => {
    if (!childProcess.killed) {
      // On Unix: this would be SIGKILL, but kill() without signal works on both platforms
      childProcess.kill();
      log('WARN', `Forcefully killed process for requestId: ${requestId}`);
    }
  }, 500);

  // Remove from active processes map
  activeProcesses.delete(requestId);

  return { cancelled: true, executionTimeMs };
}

/**
 * Progress callback for streaming CLI execution
 * @param chunk - Current text chunk
 * @param displayText - Display text (may include tool usage info) - for streaming display
 * @param explanatoryText - Explanatory text only (no tool info) - for preserving in chat history
 */
export type StreamingProgressCallback = (
  chunk: string,
  displayText: string,
  explanatoryText: string,
  contentType?: 'tool_use' | 'text'
) => void;

/**
 * Execute Claude Code CLI with streaming output
 *
 * Uses --output-format stream-json to receive real-time output from Claude Code CLI.
 * The onProgress callback is invoked for each text chunk received.
 *
 * @param prompt - The prompt to send to Claude Code CLI
 * @param onProgress - Callback invoked with each text chunk and accumulated text
 * @param timeoutMs - Timeout in milliseconds (default: 60000)
 * @param requestId - Optional request ID for cancellation support
 * @param workingDirectory - Working directory for CLI execution
 * @param model - Claude model to use (default: 'sonnet')
 * @param allowedTools - Array of allowed tool names for CLI (optional)
 * @returns Execution result with success status and output/error
 */
export async function executeClaudeCodeCLIStreaming(
  prompt: string,
  onProgress: StreamingProgressCallback,
  timeoutMs = 60000,
  requestId?: string,
  workingDirectory?: string,
  model: ClaudeModel = 'sonnet',
  allowedTools?: string[]
): Promise<ClaudeCodeExecutionResult> {
  const startTime = Date.now();

  // [yougao 改造] 离线模式占位返回，跳过 Claude CLI 流式调用
  console.log('[yougao] 离线模式：跳过 Claude CLI 流式调用，返回模拟数据');
  log('INFO', '[yougao] 离线模式：跳过 Claude CLI 流式调用，返回模拟数据', {
    promptLength: prompt.length,
    timeoutMs,
    model,
    allowedTools,
    cwd: workingDirectory ?? process.cwd(),
  });

  // 模拟流式输出
  const mockOutput = JSON.stringify({
    status: 'success',
    message: '[yougao 离线模式] 工作流已处理完成',
    values: {
      workflow: {
        name: 'offline-workflow',
        description: '离线模式生成的工作流',
        nodes: [],
        edges: []
      }
    }
  });

  // 模拟流式进度回调
  setTimeout(() => {
    onProgress('处理中...', '离线模式处理中...', '离线模式处理中...', 'text');
  }, 100);

  setTimeout(() => {
    onProgress('完成', mockOutput, mockOutput, 'text');
  }, 500);

  const executionTimeMs = Math.min(Date.now() - startTime, 600);

  // 返回模拟成功结果
  return {
    success: true,
    output: mockOutput,
    executionTimeMs,
  };
}

/**
 * Cancel an active refinement process
 *
 * @param requestId - Request ID of the refinement to cancel
 * @returns True if process was found and killed, false otherwise
 */
export async function cancelRefinement(requestId: string): Promise<{
  cancelled: boolean;
  executionTimeMs?: number;
}> {
  const activeGen = activeProcesses.get(requestId);

  if (!activeGen) {
    log('WARN', `No active refinement found for requestId: ${requestId}`);
    return { cancelled: false };
  }

  const { subprocess, startTime } = activeGen;
  const executionTimeMs = Date.now() - startTime;

  // nano-spawn v2.0.0: nodeChildProcess is a Promise that resolves to ChildProcess
  // We need to await it before calling kill()
  const childProcess = await subprocess.nodeChildProcess;

  log('INFO', `Cancelling refinement for requestId: ${requestId}`, {
    pid: childProcess.pid,
    elapsedMs: executionTimeMs,
  });

  // Kill the process (cross-platform compatible)
  // On Windows: kill() sends an unconditional termination
  // On Unix: kill() sends SIGTERM (graceful termination)
  childProcess.kill();

  // Force kill after 500ms if process doesn't terminate
  setTimeout(() => {
    if (!childProcess.killed) {
      // On Unix: this would be SIGKILL, but kill() without signal works on both platforms
      childProcess.kill();
      log('WARN', `Forcefully killed refinement process for requestId: ${requestId}`);
    }
  }, 500);

  // Remove from active processes map
  activeProcesses.delete(requestId);

  return { cancelled: true, executionTimeMs };
}
