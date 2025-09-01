import { useState, useEffect, useCallback, useRef } from "react";
import { useInput, useStdin } from "ink";

interface UseInputOptions {
  onSubmit?: () => void;
  onApproval: (approve: boolean) => void;
  hasPendingToolCalls: boolean;
  isLoading: boolean;
}

export const useInputHandling = ({ 
  onSubmit, 
  onApproval, 
  hasPendingToolCalls, 
  isLoading 
}: UseInputOptions) => {
  const [input, setInput] = useState("");
  const { stdin, setRawMode } = useStdin();
  const onSubmitRef = useRef(onSubmit);

  // Keep ref updated
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  const handleKeyPress = useCallback((keyInput: string, key: any) => {
    if (hasPendingToolCalls) {
      if (key.return || keyInput.toLowerCase() === "y") {
        onApproval(true);
      } else if (key.escape || keyInput.toLowerCase() === "n") {
        onApproval(false);
      }
      return;
    }

    if (key.return && !isLoading && onSubmitRef.current) {
      onSubmitRef.current();
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
    } else if (key.ctrl && keyInput.toLowerCase() === "c") {
      process.exit(0);
    } else if (keyInput) {
      setInput((prev) => prev + keyInput);
    }
  }, [hasPendingToolCalls, isLoading, onApproval]);

  useInput(handleKeyPress);

  // Enable raw mode
  useEffect(() => {
    if (stdin) {
      setRawMode(true);
    }
    return () => {
      if (stdin) {
        setRawMode(false);
      }
    };
  }, [stdin, setRawMode]);

  const clearInput = useCallback(() => {
    setInput("");
  }, []);

  const getCurrentInput = useCallback(() => {
    return input.trim();
  }, [input]);

  return {
    input,
    clearInput,
    getCurrentInput,
  };
};