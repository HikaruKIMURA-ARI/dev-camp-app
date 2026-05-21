import { addResponseWithCard, type PersistedCard, type Tier, type CardAttributes } from "./db";
import { defaultCardGenerator, QuotaExhaustedError, type RawCardAttributes } from "./gemini";

export type ResponseSubmissionInput = {
  name: string;
  answers: Record<string, "○" | "△" | "×">;
  customAnswer: string | null;
};

const TITLE_MAX = 60;
const RARITY_MAX = 16;
const ATTRIBUTE_MAX = 16;
const RACE_MAX = 16;
const FLAVOR_MAX = 120;
const STAT_MAX = 9999;

function clampString(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

function clampStat(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const i = Math.trunc(n);
  if (i < 0) return 0;
  return i > STAT_MAX ? STAT_MAX : i;
}

function sanitizeFlavor(s: string): string {
  // 改行・タブ・制御文字 (U+0000-U+001F, U+007F) を半角スペースに置換
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001F\u007F]/g, " ");
}

function sanitizeTitle(name: string, raw: string): string {
  const includes = raw.includes(name);
  const merged = includes ? raw : `${raw} ${name}`.trim();
  return clampString(merged, TITLE_MAX);
}

function sanitizeRawCard(name: string, raw: RawCardAttributes): CardAttributes {
  return {
    title: sanitizeTitle(name, raw.title),
    rarity: clampString(raw.rarity, RARITY_MAX),
    attribute: clampString(raw.attribute, ATTRIBUTE_MAX),
    race: clampString(raw.race, RACE_MAX),
    flavor: clampString(sanitizeFlavor(raw.flavor), FLAVOR_MAX),
    attack: clampStat(raw.attack),
    defense: clampStat(raw.defense),
  };
}

function buildDefaultCard(name: string): CardAttributes {
  return {
    title: clampString(name, TITLE_MAX),
    rarity: "N",
    attribute: "無",
    race: "ヒト",
    flavor: "",
    attack: 0,
    defense: 0,
  };
}

const TEMPLATE_TITLES = [
  "疾風の出席者",
  "酒豪王",
  "宴の支配者",
  "出席の達人",
  "幹事キラー",
  "予定の守護者",
  "出席戦士",
  "時間厳守の賢者",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function buildTemplateCard(name: string): CardAttributes {
  const h = hashString(name);
  const title = TEMPLATE_TITLES[h % TEMPLATE_TITLES.length]!;
  return {
    title: clampString(`${title} ${name}`, TITLE_MAX),
    rarity: "R",
    attribute: "無",
    race: "出席者",
    flavor: "gemini api 通信失敗時に生成される下級モンスター",
    attack: 200,
    defense: 1000,
  };
}

export const cardService = {
  generateAndPersist: async (
    eventId: string,
    input: ResponseSubmissionInput,
  ): Promise<{ responseId: number; card: PersistedCard }> => {
    let card: CardAttributes;
    let tier: Tier;

    try {
      const raw = await defaultCardGenerator.generate(input.name);
      card = sanitizeRawCard(input.name, raw);
      tier = "ai";
    } catch (err: unknown) {
      if (err instanceof QuotaExhaustedError) {
        card = buildDefaultCard(input.name);
        tier = "default";
      } else {
        card = buildTemplateCard(input.name);
        tier = "template";
      }
    }

    return await addResponseWithCard(eventId, {
      response: input,
      card: { ...card, tier },
    });
  },
};
