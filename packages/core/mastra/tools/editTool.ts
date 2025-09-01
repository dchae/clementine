import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";

export const editTool = createTool({
  id: "edit",
  description: `Replaces text within a file or creates a new file. By default, replaces a single occurrence, 
    but can replace all occurrences when replaceAll is true. Always examine the file's current content 
    before attempting a text replacement.

    Important requirements:
    1. file_path MUST be an absolute path
    2. old_string MUST be the exact literal text to replace (including whitespace, indentation, etc.)  
    3. new_string MUST be the exact literal text to replace old_string with
    4. For single replacements, include sufficient context to uniquely identify the target text
    5. Use empty old_string to create a new file`,
  inputSchema: z.object({
    file_path: z
      .string()
      .min(1, "File path cannot be empty")
      .refine((path) => path.startsWith("/") || /^[A-Z]:\\/.test(path), {
        message: "File path must be absolute, not relative",
      })
      .describe("The absolute path to the file to modify"),
    old_string: z
      .string()
      .describe("The exact literal text to replace. Use empty string to create new file"),
    new_string: z
      .string()
      .describe("The exact literal text to replace old_string with"),
    replaceAll: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether to replace all occurrences (default: false, replace only first)"),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Whether the edit operation succeeded"),
    message: z.string().describe("Success or error message"),
    file_path: z.string().describe("The file path that was modified"),
    replacements_made: z.number().describe("Number of replacements made"),
    is_new_file: z.boolean().describe("Whether a new file was created"),
    error: z.string().optional().describe("Error message if operation failed"),
  }),
  execute: async ({ context }) => {
    try {
      const { file_path, old_string, new_string, replaceAll } = context;
      let currentContent: string | null = null;
      let fileExists = false;
      let isNewFile = false;

      // Check if file exists and read content
      try {
        currentContent = await fs.readFile(file_path, 'utf8');
        fileExists = true;
        // Normalize line endings
        currentContent = currentContent.replace(/\r\n/g, '\n');
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          throw error; // Rethrow unexpected errors
        }
        fileExists = false;
      }

      // Handle new file creation
      if (old_string === '' && !fileExists) {
        isNewFile = true;
        // Ensure parent directories exist
        const dirName = path.dirname(file_path);
        await fs.mkdir(dirName, { recursive: true });
        await fs.writeFile(file_path, new_string, 'utf8');

        return {
          success: true,
          message: `Successfully created new file: ${file_path}`,
          file_path,
          replacements_made: 0,
          is_new_file: true,
        };
      }

      // Handle errors
      if (!fileExists) {
        return {
          success: false,
          message: "File not found. Use empty old_string to create a new file",
          file_path,
          replacements_made: 0,
          is_new_file: false,
          error: `File not found: ${file_path}`,
        };
      }

      if (old_string === '' && fileExists) {
        return {
          success: false,
          message: "Cannot create file that already exists",
          file_path,
          replacements_made: 0,
          is_new_file: false,
          error: `File already exists: ${file_path}`,
        };
      }

      if (!currentContent) {
        return {
          success: false,
          message: "Failed to read file content",
          file_path,
          replacements_made: 0,
          is_new_file: false,
          error: `Failed to read content of file: ${file_path}`,
        };
      }

      // Count occurrences
      const occurrences = (currentContent.match(new RegExp(old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

      if (occurrences === 0) {
        return {
          success: false,
          message: "Could not find the string to replace",
          file_path,
          replacements_made: 0,
          is_new_file: false,
          error: `Failed to find old_string in file: ${file_path}`,
        };
      }

      // Perform replacement
      let newContent: string;
      let replacementsMade: number;

      if (replaceAll) {
        newContent = currentContent.replaceAll(old_string, new_string);
        replacementsMade = occurrences;
      } else {
        newContent = currentContent.replace(old_string, new_string);
        replacementsMade = 1;
      }

      // Check if content actually changed
      if (currentContent === newContent) {
        return {
          success: false,
          message: "No changes to apply - old_string and new_string are identical",
          file_path,
          replacements_made: 0,
          is_new_file: false,
          error: `No changes to apply in file: ${file_path}`,
        };
      }

      // Write the modified content
      await fs.writeFile(file_path, newContent, 'utf8');

      return {
        success: true,
        message: `Successfully modified file: ${file_path} (${replacementsMade} replacements)`,
        file_path,
        replacements_made: replacementsMade,
        is_new_file: false,
      };

    } catch (error: any) {
      return {
        success: false,
        message: "Error during edit operation",
        file_path: context.file_path,
        replacements_made: 0,
        is_new_file: false,
        error: error.message,
      };
    }
  },
});