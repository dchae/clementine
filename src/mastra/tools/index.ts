import { readFileTool } from "./readFileTool";
import { requireApproval } from "../workflows";

export default {
  readFileTool: requireApproval(readFileTool),
};
