import { Box, Text } from "ink";

interface InputAreaProps {
  input: string;
  isLoading: boolean;
  hasPendingToolCalls: boolean;
}

export const InputArea = ({ input, isLoading, hasPendingToolCalls }: InputAreaProps) => {
  if (hasPendingToolCalls) return null;

  return (
    <>
      {isLoading && (
        <Box marginBottom={1}>
          <Text color="yellow">🤔 Thinking...</Text>
        </Box>
      )}

      <Box>
        <Text color="gray">{"> "}</Text>
        <Text>{input}</Text>
        <Text color="gray">█</Text>
      </Box>
    </>
  );
};