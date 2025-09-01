import { Box, Text } from "ink";

interface DebugPanelProps {
  logs: string[];
  visible: boolean;
}

export const DebugPanel = ({ logs, visible }: DebugPanelProps) => {
  if (!visible || logs.length === 0) return null;

  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1} marginY={1}>
      <Text color="gray" bold>
        DEBUG LOGS
      </Text>
      {logs.slice(-10).map((log, index) => (
        <Text key={index} color="gray" dimColor>
          {log}
        </Text>
      ))}
    </Box>
  );
};