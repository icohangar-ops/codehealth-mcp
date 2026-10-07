const { mock, describe, test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const bedrockState = {
  fail: false,
  empty: false,
};

const bedrockCalls = [];
const openaiCalls = [];

mock.module("@aws-sdk/client-bedrock-runtime", {
  namedExports: {
    BedrockRuntimeClient: class BedrockRuntimeClient {
      constructor(config) {
        this.config = config;
      }

      send(command, options) {
        bedrockCalls.push({
          config: this.config,
          input: command.input,
          options,
        });
        if (bedrockState.fail) {
          return Promise.reject(new Error("bedrock down"));
        }
        if (bedrockState.empty) {
          return Promise.resolve({});
        }
        if (command.input?.messages?.[0]?.content?.[0]?.text === "MULTI") {
          return Promise.resolve({
            output: {
              message: {
                content: [{ text: "Hello " }, { image: {} }, { text: "Nova" }],
              },
            },
          });
        }
        return Promise.resolve({
          output: { message: { content: [{ text: "nova summary" }] } },
        });
      }
    },
    ConverseCommand: class ConverseCommand {
      constructor(input) {
        this.input = input;
      }
    },
  },
});

mock.module("openai", {
  defaultExport: class OpenAI {
    constructor(config) {
      this.config = config;
    }

    chat = {
      completions: {
        create: async (body) => {
          openaiCalls.push({ config: this.config, body });
          return {
            choices: [{ message: { content: `ok:${body.model}` } }],
          };
        },
      },
    };
  },
});

const {
  callLLM,
  LLMUnavailableError,
  UnsupportedLLMProviderError,
} = require("../lib/llm-provider");

const ENV_KEYS = [
  "LLM_PROVIDER",
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_BASE_URL",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "ANTHROPIC_API_KEY",
];

describe("llm provider", () => {
  const original = {};

  beforeEach(() => {
    bedrockState.fail = false;
    bedrockState.empty = false;
    bedrockCalls.length = 0;
    openaiCalls.length = 0;
    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  test("defaults to Deepseek when LLM_PROVIDER is unset", async () => {
    const text = await callLLM("hello", "be brief");

    assert.equal(text, "ok:deepseek-chat");
    assert.equal(openaiCalls.length, 1);
    assert.equal(bedrockCalls.length, 0);
    assert.equal(openaiCalls[0].config.baseURL, "https://api.deepseek.com");
    assert.equal(openaiCalls[0].body.model, "deepseek-chat");
    assert.equal(openaiCalls[0].body.max_tokens, 500);
    assert.equal(openaiCalls[0].body.temperature, 0.3);
    assert.deepEqual(openaiCalls[0].body.messages, [
      { role: "system", content: "be brief" },
      { role: "user", content: "hello" },
    ]);
  });

  test("unknown providers still fall back to Deepseek", async () => {
    process.env.LLM_PROVIDER = "google";

    const text = await callLLM("hello");

    assert.equal(text, "ok:deepseek-chat");
    assert.equal(openaiCalls[0].body.model, "deepseek-chat");
  });

  test("LLM_PROVIDER=openai still uses the OpenAI chat API", async () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-4o-mini";

    const text = await callLLM("hello");

    assert.equal(text, "ok:gpt-4o-mini");
    assert.equal(openaiCalls[0].config.apiKey, "test-key");
    assert.equal(bedrockCalls.length, 0);
  });

  test("LLM_PROVIDER=bedrock calls Nova Lite via the Converse API", async () => {
    process.env.LLM_PROVIDER = "bedrock";
    process.env.AWS_REGION = "eu-west-1";
    process.env.AWS_DEFAULT_REGION = "eu-central-1";

    const text = await callLLM("Summarize this", "You are an architect");

    assert.equal(text, "nova summary");
    assert.equal(openaiCalls.length, 0);
    assert.equal(bedrockCalls.length, 1);

    const call = bedrockCalls[0];
    assert.equal(call.config.region, "us-east-1");
    assert.equal(Object.hasOwn(call.config, "credentials"), false);
    assert.equal(call.config.maxAttempts, 3);
    assert.equal(call.input.modelId, "us.amazon.nova-lite-v1:0");
    assert.deepEqual(call.input.system, [{ text: "You are an architect" }]);
    assert.deepEqual(call.input.messages, [
      { role: "user", content: [{ text: "Summarize this" }] },
    ]);
    assert.deepEqual(call.input.inferenceConfig, {
      maxTokens: 500,
      temperature: 0.3,
    });
    assert.ok(call.options.abortSignal instanceof AbortSignal);
    assert.equal(call.options.abortSignal.aborted, false);
  });

  test("LLM_PROVIDER=Bedrock is accepted case-insensitively", async () => {
    process.env.LLM_PROVIDER = "  Bedrock  ";

    const text = await callLLM("only user");

    assert.equal(text, "nova summary");
    assert.equal(bedrockCalls[0].input.system, undefined);
  });

  test("joins Nova text blocks and ignores non-text content", async () => {
    process.env.LLM_PROVIDER = "bedrock";

    const text = await callLLM("MULTI");

    assert.equal(text, "Hello Nova");
  });

  test("returns an empty string when Nova sends no text", async () => {
    process.env.LLM_PROVIDER = "bedrock";
    bedrockState.empty = true;

    const text = await callLLM("hello");

    assert.equal(text, "");
  });

  test("wraps Bedrock failures as LLMUnavailableError", async () => {
    process.env.LLM_PROVIDER = "bedrock";
    bedrockState.fail = true;

    await assert.rejects(callLLM("hello"), (err) => {
      assert.ok(err instanceof LLMUnavailableError);
      assert.equal(err.cause.message, "bedrock down");
      assert.match(err.userMessage, /temporarily unavailable/);
      return true;
    });
  });

  test("LLM_PROVIDER=anthropic fails with a message pointing at bedrock", async () => {
    process.env.LLM_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-ant-should-not-be-used";

    await assert.rejects(callLLM("hello", "system"), (err) => {
      assert.ok(err instanceof UnsupportedLLMProviderError);
      assert.equal(err instanceof LLMUnavailableError, false);
      assert.match(err.message, /anthropic/i);
      assert.match(err.message, /LLM_PROVIDER=bedrock/);
      assert.match(err.message, /us\.amazon\.nova-lite-v1:0/);
      return true;
    });

    assert.equal(bedrockCalls.length, 0);
    assert.equal(openaiCalls.length, 0);
  });

  test("ANTHROPIC in any case is rejected", async () => {
    process.env.LLM_PROVIDER = "  ANTHROPIC ";

    await assert.rejects(callLLM("hello"), (err) => {
      assert.ok(err instanceof UnsupportedLLMProviderError);
      assert.match(err.message, /bedrock/);
      return true;
    });
  });

  test("the provider module has no Anthropic API code path", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../lib/llm-provider.js"),
      "utf8",
    );
    assert.doesNotMatch(src, /api\.anthropic\.com/);
    assert.doesNotMatch(src, /claude-sonnet/);
    assert.doesNotMatch(src, /ANTHROPIC_API_KEY/);
    assert.doesNotMatch(src, /anthropic-version/);
    assert.doesNotMatch(src, /callAnthropic/);
    assert.match(src, /us\.amazon\.nova-lite-v1:0/);
    assert.match(src, /ConverseCommand/);
  });
});
