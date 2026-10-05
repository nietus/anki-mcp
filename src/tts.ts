import { YankiConnect } from "yanki-connect";
import { cleanWithRegex } from "./utils.js";

export const languageToVoiceMap: Record<string, string> = {
  en: "en-US-JennyNeural",
  es: "es-ES-ElviraNeural",
  fr: "fr-FR-DeniseNeural",
  de: "de-DE-KatjaNeural",
  it: "it-IT-ElsaNeural",
  ja: "ja-JP-NanamiNeural",
  ko: "ko-KR-SunHiNeural",
  pt: "pt-BR-FranciscaNeural",
  "pt-PT": "pt-PT-RaquelNeural",
  ru: "ru-RU-SvetlanaNeural",
  zh: "zh-CN-XiaoxiaoNeural",
  ar: "ar-EG-SalmaNeural",
  nl: "nl-NL-ColetteNeural",
  hi: "hi-IN-SwaraNeural",
  tr: "tr-TR-EmelNeural",
  pl: "pl-PL-ZofiaNeural",
  sv: "sv-SE-SofieNeural",
  fi: "fi-FI-SelmaNeural",
  da: "da-DK-ChristelNeural",
  no: "nb-NO-IselinNeural",
  cs: "cs-CZ-VlastaNeural",
  hu: "hu-HU-NoemiNeural",
  el: "el-GR-AthinaNeural",
  he: "he-IL-HilaNeural",
  th: "th-TH-PremwadeeNeural",
  vi: "vi-VN-HoaiMyNeural",
  id: "id-ID-GadisNeural",
  ms: "ms-MY-YasminNeural",
  ro: "ro-RO-AlinaNeural",
};

export const supportedLanguages = Object.keys(languageToVoiceMap);

export function assertSupportedLanguage(language: string): void {
  if (!languageToVoiceMap[language]) {
    throw new Error(
      `Unsupported language code: '${language}'. Supported: ${supportedLanguages.join(
        ", "
      )}`
    );
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generates speech with Azure TTS and stores it in the active Anki profile's
 * media folder via AnkiConnect. Returns the `[sound:...]` tag for the field.
 */
export async function generateSpeech(
  client: YankiConnect,
  text: string,
  language = "en"
): Promise<string> {
  const subscriptionKey = process.env.AZURE_API_KEY;
  if (!subscriptionKey) {
    throw new Error(
      "AZURE_API_KEY is not configured, so audio generation is disabled."
    );
  }

  const voice = languageToVoiceMap[language] || language || "en-US-JennyNeural";
  const region = process.env.AZURE_REGION || "eastus";
  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  // Field values may contain HTML; TTS should only read the plain text.
  const plainText = cleanWithRegex(text);
  if (!plainText) {
    throw new Error("Cannot generate audio from empty text.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": subscriptionKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
      "User-Agent": "AnkiAudioTool",
    },
    body: `<speak version='1.0' xml:lang='${language}'><voice xml:lang='${language}' name='${voice}'>${escapeXml(
      plainText
    )}</voice></speak>`,
  });

  if (!response.ok) {
    throw new Error(
      `Azure TTS request failed: ${response.status} ${response.statusText}`
    );
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length === 0) {
    throw new Error("Received empty audio data from Azure TTS API.");
  }

  const fileName = `tts_${language}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}.mp3`;
  const storedName = await client.media.storeMediaFile({
    filename: fileName,
    data: audio.toString("base64"),
  });

  return `[sound:${storedName || fileName}]`;
}
