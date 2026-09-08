import { ChatOpenAI } from "@langchain/openai";

/**
 * Keep task-to-provider choices explicit. Agents still accept injected
 * generators in tests, while production resolves providers from environment
 * variables at call time.
 */
export const MODEL_ROUTING = {
  itinerary: "deepseek",
  "destination-guide": "minimax",
  dining: "minimax",
} as const;

export type RoutedModelTask = keyof typeof MODEL_ROUTING;

export function createRoutedChatModel(task: RoutedModelTask): ChatOpenAI | undefined {
  const provider = MODEL_ROUTING[task];
  if (provider === "deepseek") {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return undefined;
    return new ChatOpenAI({
      apiKey,
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      temperature: 0,
      streamUsage: false,
      // DeepSeek V4 thinking mode rejects the tool_choice used for structured output.
      modelKwargs: { thinking: { type: "disabled" } },
      configuration: {
        baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      },
    });
  }

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) return undefined;
  return new ChatOpenAI({
    apiKey,
    model: process.env.MINIMAX_MODEL || "MiniMax-M2.7",
    // MiniMax requires temperature to be greater than zero.
    temperature: 0.1,
    streamUsage: false,
    configuration: { baseURL: process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1" },
  });
}
