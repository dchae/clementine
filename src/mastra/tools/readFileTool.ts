import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as mime from "mime-types";
import iconv from "iconv-lite";
import { isBinary } from "istextorbinary";

const MB = 1024 * 1024;
const FILE_SIZE_LIMIT_MB = 20;
const SVG_MAX_SIZE_MB = 1;
const MAX_LINE_LENGTH = 2000;

export const readFileTool = createTool({
  id: "readFile",
  description: `Reads and returns the content of a specified file. If the file is large, the content will be truncated. 
    The tool's response will clearly indicate if truncation has occurred and will provide details on how to read more 
    of the file using the 'offset' and 'limit' parameters. Handles text, images (PNG, JPG, GIF, WEBP, SVG, BMP), 
    and PDF files. For text files, it can read specific line ranges.`,
  inputSchema: z
    .object({
      absolutePath: z
        .string()
        .min(1, "The 'absolutePath' parameter must be non-empty")
        .refine((path) => path.startsWith("/") || /^[A-Z]:\\/.test(path), {
          message:
            "File path must be absolute, not relative. You must provide an absolute path.",
        })
        .describe(
          `The absolute path to the file to read (e.g., '/home/user/project/file.txt'). 
         Relative paths are not supported. You must provide an absolute path.`,
        ),
      offset: z
        .number()
        .min(0, "Offset must be a non-negative number")
        .optional()
        .describe(
          `Optional: For text files, the 0-based line number to start reading from. 
         Requires 'limit' to be set. Use for paginating through large files.`,
        ),
      limit: z
        .number()
        .min(1, "Limit must be a positive number")
        .optional()
        .describe(
          `Optional: For text files, maximum number of lines to read. Use with 'offset' to paginate 
         through large files. If omitted, reads the entire file (if feasible, up to a default limit).`,
        ),
    })
    .refine(
      (data) => {
        if (data.offset !== undefined && data.limit === undefined) {
          return false;
        }
        return true;
      },
      {
        message: "When 'offset' is provided, 'limit' must also be specified.",
        path: ["limit"],
      },
    ),
  outputSchema: z.object({
    content: z.string(),
    isTruncated: z.boolean().optional(),
    linesShown: z.array(z.number()).optional(),
    totalLines: z.number().optional(),
    nextOffset: z.number().optional(),
    error: z.string().optional(),
    mimeType: z.string().optional(),
    fileType: z.string().optional(),
    fileSize: z.number().optional(),
  }),
  execute: async ({ context, mastra }) => {
    return await readFile(context.absolutePath, context.offset, context.limit);
  },
});

const readFile = async (
  absolutePath: string,
  offset?: number,
  limit?: number,
) => {
  try {
    await fs.access(absolutePath, fs.constants.R_OK);

    const stats = await fs.stat(absolutePath);
    if (stats.isDirectory()) {
      return {
        content: "",
        error: `Path is a directory, not a file: ${absolutePath}`,
      };
    }

    if (stats.size / MB > FILE_SIZE_LIMIT_MB) {
      return {
        content: "",
        error: `File size exceeds the ${FILE_SIZE_LIMIT_MB}MB limit: ${absolutePath} (${(stats.size / MB).toFixed(2)}MB)`,
      };
    }

    const fileType = await detectFileType(absolutePath);
    const mimeType = mime.lookup(absolutePath) || "application/octet-stream";
    const fileSize = stats.size;

    switch (fileType) {
      case "binary": {
        return {
          content: `Cannot display content of binary file: ${path.basename(absolutePath)}
File size: ${fileSize} bytes
MIME type: ${mimeType}

This appears to be a binary file that cannot be displayed as plain text.`,
          mimeType,
          fileType,
          fileSize,
        };
      }

      case "image":
      case "pdf":
      case "audio":
      case "video": {
        const buffer = await fs.readFile(absolutePath);
        const base64Data = buffer.toString("base64");

        return {
          content: `[${fileType.toUpperCase()} File: ${path.basename(absolutePath)}]
File size: ${fileSize} bytes
MIME type: ${mimeType}

This is a ${fileType} file. The binary content has been encoded as base64 for processing.
Base64 data: ${base64Data.substring(0, 100)}${base64Data.length > 100 ? "..." : ""}`,
          mimeType,
          fileType,
          fileSize,
        };
      }

      case "svg": {
        if (fileSize / MB > SVG_MAX_SIZE_MB) {
          return {
            content: `Cannot display content of SVG file larger than ${SVG_MAX_SIZE_MB}MB: ${path.basename(absolutePath)}`,
            error: `SVG file too large (${(fileSize / 1024 / 1024).toFixed(2)}MB > 1MB)`,
            mimeType,
            fileType,
            fileSize,
          };
        }

        const content = await readFileWithEncoding(absolutePath);

        if (offset !== undefined || limit !== undefined) {
          const paginationResult = handlePagination(
            content,
            offset,
            limit,
            content.split("\n").length,
            false,
          );
          return {
            ...paginationResult,
            mimeType,
            fileType,
            fileSize,
          };
        }

        return {
          content,
          mimeType,
          fileType,
          fileSize,
        };
      }

      case "text":
      default: {
        // Read text file with proper encoding detection (BOM-aware)
        const content = await readFileWithEncoding(absolutePath);
        const lines = content.split("\n");
        const originalLineCount = lines.length;

        if (offset !== undefined || limit !== undefined) {
          const paginationResult = handlePagination(
            content,
            offset,
            limit,
            originalLineCount,
            true,
          );
          return {
            ...paginationResult,
            mimeType,
            fileType,
            fileSize,
          };
        }

        const DEFAULT_MAX_LINES = 2000;
        const MAX_LINE_LENGTH = 2000;

        if (originalLineCount > DEFAULT_MAX_LINES) {
          const truncatedLines = lines.slice(0, DEFAULT_MAX_LINES);
          let formattedLines = truncatedLines.map((line) =>
            line.length > MAX_LINE_LENGTH
              ? line.substring(0, MAX_LINE_LENGTH) + "... [line truncated]"
              : line,
          );

          const truncatedContent = formattedLines.join("\n");

          return {
            content: `IMPORTANT: The file content has been truncated.
Status: Showing lines 1-${DEFAULT_MAX_LINES} of ${originalLineCount} total lines.
Action: To read more of the file, you can use the 'offset' and 'limit' parameters. For example, use offset: ${DEFAULT_MAX_LINES}.

--- FILE CONTENT (truncated) ---
${truncatedContent}`,
            isTruncated: true,
            linesShown: [1, DEFAULT_MAX_LINES],
            totalLines: originalLineCount,
            nextOffset: DEFAULT_MAX_LINES,
            mimeType,
            fileType,
            fileSize,
          };
        }

        let linesWereTruncated = false;
        const formattedLines = lines.map((line) => {
          if (line.length > MAX_LINE_LENGTH) {
            linesWereTruncated = true;
            return line.substring(0, MAX_LINE_LENGTH) + "... [line truncated]";
          }
          return line;
        });

        return {
          content: formattedLines.join("\n"),
          isTruncated: linesWereTruncated,
          totalLines: originalLineCount,
          mimeType,
          fileType,
          fileSize,
        };
      }
    }
  } catch (error: any) {
    let errorMessage = "Unknown error occurred";

    if (error.code === "ENOENT") {
      errorMessage = `File not found: ${absolutePath}`;
    } else if (error.code === "EACCES") {
      errorMessage = `Permission denied: ${absolutePath}`;
    } else if (error.code === "EISDIR") {
      errorMessage = `Path is a directory, not a file: ${absolutePath}`;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      content: "",
      error: errorMessage,
    };
  }
};

const handlePagination = (
  content: string,
  offset: number | undefined,
  limit: number | undefined,
  originalLineCount: number | undefined,
  truncateLongLines: boolean,
) => {
  const lines = content.split("\n");
  const totalLines = originalLineCount || lines.length;
  const startLine = offset || 0;
  const effectiveLimit = limit === undefined ? 2000 : limit;
  const endLine = Math.min(startLine + effectiveLimit, totalLines);
  const actualStartLine = Math.min(startLine, totalLines);

  if (actualStartLine >= totalLines) {
    return {
      content: "",
      error: `Offset ${startLine} is beyond the end of the file (${totalLines} lines)`,
    };
  }

  const selectedLines = lines.slice(actualStartLine, endLine);

  let linesWereTruncated = false;
  const formattedLines = selectedLines.map((line) => {
    if (truncateLongLines && line.length > MAX_LINE_LENGTH) {
      linesWereTruncated = true;
      return line.substring(0, MAX_LINE_LENGTH) + "... [line truncated]";
    }
    return line;
  });

  const paginatedContent = formattedLines.join("\n");
  const contentRangeTruncated = startLine > 0 || endLine < totalLines;
  const isTruncated = contentRangeTruncated || linesWereTruncated;

  return {
    content: paginatedContent,
    isTruncated,
    linesShown: [actualStartLine + 1, endLine], // 1-based for user display
    totalLines,
    nextOffset: endLine < totalLines ? endLine : undefined,
  };
};

const readFileWithEncoding = async (filePath: string): Promise<string> => {
  const buffer = await fs.readFile(filePath);
  // using iconv-lite to handle BOM detection and removal
  return iconv.decode(buffer, "utf8");
};

const isBinaryFile = async (filePath: string): Promise<boolean> => {
  try {
    const buffer = await fs.readFile(filePath);
    return !!isBinary(filePath, buffer);
  } catch (error) {
    return false;
  }
};

const detectFileType = async (
  filePath: string,
): Promise<"text" | "image" | "pdf" | "audio" | "video" | "binary" | "svg"> => {
  const ext = path.extname(filePath).toLowerCase();

  // Special handling for TypeScript files that might be misidentified
  if ([".ts", ".mts", ".cts"].includes(ext)) {
    return "text";
  }

  if (ext === ".svg") {
    return "svg";
  }

  const mimeType = mime.lookup(filePath);
  if (mimeType) {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType === "application/pdf") return "pdf";
  }

  if (await isBinaryFile(filePath)) {
    return "binary";
  }

  return "text";
};
