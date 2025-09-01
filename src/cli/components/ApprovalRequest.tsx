import { Box, Text } from "ink";
import { PendingToolCall } from "../types";

interface ApprovalRequestProps {
  pendingToolCalls: PendingToolCall[];
}

export const ApprovalRequest = ({ pendingToolCalls }: ApprovalRequestProps) => {
  if (pendingToolCalls.length === 0) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      padding={1}
      marginBottom={1}
    >
      <Text color="yellow" bold>
        🔐 Tool Execution Approval Required
      </Text>

      <Box marginTop={1} marginBottom={1} flexDirection="column">
        <Text color="cyan" bold>
          Tools to execute:
        </Text>
        {pendingToolCalls.map((toolCall, index) => (
          <Box key={index} marginLeft={2}>
            <Text color="cyan">• {toolCall.message}</Text>
          </Box>
        ))}
      </Box>

      <Box>
        <Text color="green">Press Y/Enter to approve, </Text>
        <Text color="red">N/Esc to reject</Text>
      </Box>
    </Box>
  );
};