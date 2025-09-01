import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const shellTool = createTool({
  id: "shell",
  description: "Executes shell commands and returns the output. Use this tool to run terminal commands, scripts, or system operations.",
  inputSchema: z.object({
    command: z
      .string()
      .min(1, "Command cannot be empty")
      .describe("The shell command to execute"),
    directory: z
      .string()
      .optional()
      .describe("Optional: Working directory to execute the command in"),
    timeout: z
      .number()
      .min(1000)
      .max(60000)
      .optional()
      .default(10000)
      .describe("Optional: Timeout in milliseconds (1000-60000, default 10000)"),
  }),
  outputSchema: z.object({
    stdout: z.string().describe("Standard output from the command"),
    stderr: z.string().describe("Standard error output from the command"),
    exitCode: z.number().describe("Exit code of the command"),
    command: z.string().describe("The command that was executed"),
    directory: z.string().optional().describe("Directory where command was executed"),
    error: z.string().optional().describe("Error message if execution failed"),
  }),
  execute: async ({ context }) => {
    try {
      const options: any = {
        timeout: context.timeout,
        encoding: 'utf8',
      };

      if (context.directory) {
        options.cwd = context.directory;
      }

      const result = await execAsync(context.command, options);

      return {
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
        exitCode: 0,
        command: context.command,
        directory: context.directory,
      };
    } catch (error: any) {
      return {
        stdout: error.stdout?.toString() || "",
        stderr: error.stderr?.toString() || "",
        exitCode: error.code || 1,
        command: context.command,
        directory: context.directory,
        error: error.message,
      };
    }
  },
});