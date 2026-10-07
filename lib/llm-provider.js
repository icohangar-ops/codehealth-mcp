/**
 * LLM provider abstraction — supports Deepseek (default), OpenAI, and
 * Amazon Nova on Amazon Bedrock.
 *
 * Resilience: every provider call is bounded by a timeout and surfaces
 * failures instead of silently returning empty text. `callLLM` translates
 * provider failures into a typed `LLMUnavailableError` carrying a clean,
 * user-safe message so callers (e.g. the Slack listener) never leak raw
 * exception text or API internals to end users.
 *
 * `LLM_PROVIDER=anthropic` is rejected. That provider was removed in favor
 * of Amazon Nova on Bedrock.
 */

const LLM_TIMEOUT_MS = 30_000;

const BEDROCK_REGION = "us-east-1";
const NOVA_LITE_MODEL_ID = "us.amazon.nova-lite-v1:0";

const USER_SAFE_MESSAGE =
  "The AI summarization service is temporarily unavailable. Analysis results are still shown below; please try again shortly for the AI summary.";

const REMOVED_ANTHROPIC_MESSAGE =
  "LLM_PROVIDER=anthropic is no longer supported. Set LLM_PROVIDER=bedrock to use Amazon Nova on Amazon Bedrock (model us.amazon.nova-lite-v1:0 in us-east-1).";

/**
 * Thrown when an LLM provider call fails. `message` is safe to show to end
 * users; the original cause is preserved on `.cause` for server-side logging.
 */
class LLMUnavailableError extends Error {
  constructor(cause) {
    super(USER_SAFE_MESSAGE);
    this.name = "LLMUnavailableError";
    this.userMessage = USER_SAFE_MESSAGE;
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Thrown for a provider value that cannot be used. The message is meant for
 * operators configuring LLM_PROVIDER, not for end users in Slack.
 */
class UnsupportedLLMProviderError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedLLMProviderError";
  }
}

function resolveProvider() {
  const raw = process.env.LLM_PROVIDER;
  if (raw === undefined || String(raw).trim() === "") return "deepseek";
  return String(raw).trim().toLowerCase();
}

async function callLLM(prompt, systemPrompt) {
  const provider = resolveProvider();

  // Configuration error: do not wrap this as a transient outage. The message
  // tells operators to switch to the Bedrock provider.
  if (provider === "anthropic") {
    throw new UnsupportedLLMProviderError(REMOVED_ANTHROPIC_MESSAGE);
  }

  try {
    switch (provider) {
      case "deepseek":
        return await callDeepseek(prompt, systemPrompt);
      case "openai":
        return await callOpenAI(prompt, systemPrompt);
      case "bedrock":
        return await callBedrock(prompt, systemPrompt);
      default:
        return await callDeepseek(prompt, systemPrompt);
    }
  } catch (err) {
    // Surface a clean, typed error rather than leaking raw provider/exception
    // text. The original cause is preserved for logging.
    throw new LLMUnavailableError(err);
  }
}

async function callDeepseek(prompt, systemPrompt) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
    // SDK-level per-request timeout (the SDK aborts and throws on overrun).
    timeout: LLM_TIMEOUT_MS,
    maxRetries: 2,
  });

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages,
    max_tokens: 500,
    temperature: 0.3,
  });

  return response.choices[0]?.message?.content || "";
}

async function callOpenAI(prompt, systemPrompt) {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    timeout: LLM_TIMEOUT_MS,
    maxRetries: 2,
  });

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages,
    max_tokens: 500,
    temperature: 0.3,
  });

  return response.choices[0]?.message?.content || "";
}

async function callBedrock(prompt, systemPrompt) {
  const { BedrockRuntimeClient, ConverseCommand } = await import(
    "@aws-sdk/client-bedrock-runtime"
  );

  // No explicit credentials: the client uses the standard AWS credential
  // chain (environment variables, shared config, SSO, or an IAM role).
  // Region is fixed to us-east-1 because the Nova Lite inference profile
  // us.amazon.nova-lite-v1:0 is a US profile.
  const client = new BedrockRuntimeClient({
    region: BEDROCK_REGION,
    maxAttempts: 3,
  });

  const input = {
    modelId: NOVA_LITE_MODEL_ID,
    messages: [
      {
        role: "user",
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 500,
      temperature: 0.3,
    },
  };
  if (systemPrompt) {
    input.system = [{ text: systemPrompt }];
  }

  const response = await client.send(new ConverseCommand(input), {
    abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  return extractConverseText(response);
}

function extractConverseText(response) {
  const blocks = response?.output?.message?.content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .map((block) => (typeof block?.text === "string" ? block.text : ""))
    .join("");
}

module.exports = {
  callLLM,
  LLMUnavailableError,
  UnsupportedLLMProviderError,
};
