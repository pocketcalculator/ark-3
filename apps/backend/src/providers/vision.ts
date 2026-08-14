import { AzureOpenAI } from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import { OcrResultSchema } from "@ark-3/contracts";
import type { Config } from "../config.js";

export interface VisionExtractionResult {
  readonly resourceGroupName: string | null;
  readonly uncertainty: number;
  readonly rawText: string;
}

export interface VisionProvider {
  extractResourceGroupName(imageBuffer: Buffer): Promise<VisionExtractionResult>;
}

/** Fail-closed default returned whenever extraction cannot be trusted. */
const FAIL_CLOSED: VisionExtractionResult = {
  resourceGroupName: null,
  uncertainty: 1,
  rawText: "",
};

const SYSTEM_PROMPT = [
  "You extract a single Azure resource group name written on a physical label in the image.",
  "Respond ONLY with strict JSON matching this shape:",
  '{"resourceGroupName": string|null, "rawText": string, "uncertainty": number}.',
  "resourceGroupName is the exact name if legible, otherwise null.",
  "rawText is all text you can read. uncertainty is 0 (confident) to 1 (unsure).",
  "Do not include markdown fences or any commentary.",
].join(" ");

const AZURE_COGNITIVE_SCOPE = "https://cognitiveservices.azure.com/.default";

export class AzureOpenAIVisionProvider implements VisionProvider {
  private readonly client: AzureOpenAI;
  private readonly deployment: string;

  public constructor(config: Config) {
    const credential = new DefaultAzureCredential();
    const azureADTokenProvider = getBearerTokenProvider(
      credential,
      AZURE_COGNITIVE_SCOPE,
    );
    this.client = new AzureOpenAI({
      endpoint: config.openaiEndpoint,
      azureADTokenProvider,
      apiVersion: config.openaiApiVersion,
      deployment: config.openaiDeploymentName,
    });
    this.deployment = config.openaiDeploymentName;
  }

  public async extractResourceGroupName(
    imageBuffer: Buffer,
  ): Promise<VisionExtractionResult> {
    try {
      const dataUrl = `data:image/jpeg;base64,${imageBuffer.toString("base64")}`;
      const response = await this.client.responses.create({
        model: this.deployment,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: SYSTEM_PROMPT },
              { type: "input_image", image_url: dataUrl, detail: "low" },
            ],
          },
        ],
      });

      const text = response.output_text;
      if (typeof text !== "string" || text.trim() === "") {
        return FAIL_CLOSED;
      }
      return parseVisionJson(text);
    } catch {
      // Never log raw model content; only the fail-closed outcome is surfaced.
      return FAIL_CLOSED;
    }
  }
}

/** Parses model output using the shared contract schema; fails closed on error. */
export function parseVisionJson(text: string): VisionExtractionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return FAIL_CLOSED;
  }
  const result = OcrResultSchema.safeParse(parsed);
  if (!result.success) {
    return FAIL_CLOSED;
  }
  return {
    resourceGroupName: result.data.resourceGroupName,
    uncertainty: result.data.uncertainty,
    rawText: result.data.rawText,
  };
}

/** Test/mock provider returning a configurable result. */
export class MockVisionProvider implements VisionProvider {
  private result: VisionExtractionResult;

  public constructor(result: VisionExtractionResult) {
    this.result = result;
  }

  public setResult(result: VisionExtractionResult): void {
    this.result = result;
  }

  public extractResourceGroupName(_imageBuffer: Buffer): Promise<VisionExtractionResult> {
    return Promise.resolve(this.result);
  }
}
