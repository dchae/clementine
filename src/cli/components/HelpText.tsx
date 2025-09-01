import { Box, Text } from "ink";

interface HelpTextProps {
  hasPendingToolCalls: boolean;
}

export const HelpText = ({ hasPendingToolCalls }: HelpTextProps) => {
  return (
    <Box marginTop={1}>
      <Text color="gray" dimColor>
        {hasPendingToolCalls
          ? "Waiting for approval decision..."
          : "Type your message and press Enter to send. Press Ctrl+C to exit."}
      </Text>
    </Box>
  );
};