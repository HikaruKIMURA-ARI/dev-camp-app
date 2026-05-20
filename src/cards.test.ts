import { beforeEach, describe, expect, it } from "bun:test";
import {
  setCardGeneratorForTest,
  __resetQuotaForTest,
  QuotaExhaustedError,
  TransientError,
  type RawCardAttributes,
  type CardGenerator,
} from "./gemini";
import { createEvent, db } from "./db";
import { cardService } from "./cards";
import {
  eventOptionResponses,
  eventOptions,
  eventResponses,
  events,
  participantCards,
} from "./schema";

/**
 * Task 2.3: Card Service — 3 段フォールバックとサニタイズ
 *
 * 対象（src/cards.ts として新規作成予定）:
 *  - `cardService.generateAndPersist(eventId, input)` — Adapter 呼び出し（トランザクション外）
 *    → サニタイズ / クランプ → `addResponseWithCard` で 1 トランザクション永続化
 *  - 3 段フォールバック:
 *      Tier 1 (ai)       … Adapter 成功
 *      Tier 2 (template) … TransientError（timeout / rate_limited / server_5xx /
 *                          json_invalid / schema_invalid）
 *      Tier 3 (default)  … QuotaExhaustedError
 *  - サニタイズ: 二つ名に参加者名を必ず含める / フレーバー制御文字除去 / 文字列クランプ
 *  - 数値クランプ: 0 以上、上限値（attack / defense は 9999）以内
 *  - いずれの Tier でも例外を呼び出し元に伝播させず、必ず永続化済みカードを返す
 *
 * スコープ外:
 *  - Adapter 内部の SDK 呼び出し（Task 2.1 で gemini.test.ts）
 *  - Repository の同一トランザクション保証（Task 2.2 で db.test.ts）
 *  - routes 経由のフラグメント返却（Task 3.1 で routes.test.ts）
 *
 * 設計の前提（古典派 TDD + .claude/rules/testing/test-philosophy.md）:
 *  - DB は実体（`.env.test` の in-memory drizzle）を使う
 *  - Adapter（プロセス外）のみ `setCardGeneratorForTest` でスタブ差し替え
 *  - Arrange（イベント seed / スタブ配線）は `beforeEach` 内に置く
 *  - 子 → 親順（participant_cards → event_option_responses → event_responses →
 *    event_options → events）で delete してケース間隔離
 *
 * 参照:
 *  - 要件: Requirement 1.1, 1.5, 1.6, 4.1, 4.2, 4.3, 4.4, 4.6, 4.7, 7.2, 7.4
 *  - 設計: design.md `CardService（src/cards.ts）`
 *  - タスク: .kiro/specs/tyousei-ph2/tasks.md Task 2.3
 *
 * 上限値の参考既定（design.md）:
 *  - title 60 / rarity 16 / attribute 16 / race 16 / flavor 120
 *  - attack 0–9999 / defense 0–9999
 */

describe("src/cards.ts — Card Service（Task 2.3）", () => {
  let eventId: string;

  beforeEach(async () => {
    await db.delete(participantCards);
    await db.delete(eventOptionResponses);
    await db.delete(eventResponses);
    await db.delete(eventOptions);
    await db.delete(events);
    __resetQuotaForTest();
    setCardGeneratorForTest(null);

    const { id } = await createEvent({
      title: "T",
      options: ["18:00", "19:00"],
      customQuestion: null,
    });
    eventId = id;
  });

  function stubGen(gen: (name: string) => Promise<RawCardAttributes>): CardGenerator {
    return { generate: gen, verifyConnectivity: async () => ({ ok: true }) };
  }

  /**
   * A. Tier 判定の振る舞い（generateAndPersist）
   *
   * 観点:
   *  - Adapter 成否によって Tier が ai / template / default に分岐する
   *  - どの Tier でも 1 件の参加者カードが永続化され `{ responseId, card }` を返す
   *  - どの Tier でも呼び出し元へ例外を投げない（フォールバックで吸収）
   */
  describe("A. Tier 判定 — Adapter 応答に応じたフォールバック", () => {
    it("Adapter が RawCardAttributes を返したら tier='ai' でカードが永続化され、戻り値の responseId と card.responseId が一致する", async () => {
      setCardGeneratorForTest(
        stubGen(async (name) => ({
          title: `炎の戦士${name}`,
          rarity: "SR",
          attribute: "火",
          race: "戦士",
          flavor: "勇敢",
          attack: 1500,
          defense: 1200,
        })),
      );

      const result = await cardService.generateAndPersist(eventId, {
        name: "アリス",
        answers: {},
        customAnswer: null,
      });

      expect(result.card.tier).toBe("ai");
      expect(result.card.responseId).toBe(result.responseId);
      const cards = await db.select().from(participantCards);
      expect(cards.length).toBe(1);
    });

    it("Adapter が TransientError('timeout') を投げたら tier='template' のテンプレカードが永続化され、例外は呼び出し元に伝播しない", async () => {
      setCardGeneratorForTest(
        stubGen(async () => {
          throw new TransientError("timeout");
        }),
      );

      const result = await cardService.generateAndPersist(eventId, {
        name: "ボブ",
        answers: {},
        customAnswer: null,
      });

      expect(result.card.tier).toBe("template");
      const cards = await db.select().from(participantCards);
      expect(cards.length).toBe(1);
      expect(cards[0]!.tier).toBe("template");
    });

    it("Adapter が QuotaExhaustedError を投げたら tier='default' の最低限カードが永続化され、例外は呼び出し元に伝播しない", async () => {
      setCardGeneratorForTest(
        stubGen(async () => {
          throw new QuotaExhaustedError("q");
        }),
      );

      const result = await cardService.generateAndPersist(eventId, {
        name: "キャロル",
        answers: {},
        customAnswer: null,
      });

      expect(result.card.tier).toBe("default");
      const cards = await db.select().from(participantCards);
      expect(cards.length).toBe(1);
    });

    it("どの Tier 経路でも participant_cards に 1 行追加され、戻り値 card の title に参加者名が必ず含まれる（観察可能な完了条件）", async () => {
      setCardGeneratorForTest(
        stubGen(async (name) => ({
          title: `炎の${name}`,
          rarity: "SR",
          attribute: "火",
          race: "戦士",
          flavor: "f",
          attack: 100,
          defense: 100,
        })),
      );
      const r1 = await cardService.generateAndPersist(eventId, {
        name: "alice",
        answers: {},
        customAnswer: null,
      });
      expect(r1.card.title).toContain("alice");

      setCardGeneratorForTest(
        stubGen(async () => {
          throw new TransientError("timeout");
        }),
      );
      const r2 = await cardService.generateAndPersist(eventId, {
        name: "bob",
        answers: {},
        customAnswer: null,
      });
      expect(r2.card.title).toContain("bob");

      setCardGeneratorForTest(
        stubGen(async () => {
          throw new QuotaExhaustedError("q");
        }),
      );
      const r3 = await cardService.generateAndPersist(eventId, {
        name: "carol",
        answers: {},
        customAnswer: null,
      });
      expect(r3.card.title).toContain("carol");
    });
  });

  /**
   * B. サニタイズ — 二つ名 / フレーバー / 文字列クランプ
   *
   * 観点:
   *  - 参加者名を含まない AI 応答は末尾に名前を付与して必ず含める
   *  - 既に名前が含まれる応答はそのまま採用（二重付与しない）
   *  - フレーバーの改行 / タブ / 制御文字（U+0000-U+001F, U+007F）は半角スペース化
   *  - title / rarity / attribute / race / flavor が上限超なら切り詰める
   */
  describe("B. サニタイズ — 参加者名付与 / 制御文字除去 / 文字列クランプ", () => {
    it("Adapter 応答の title に参加者名が含まれない場合、末尾に名前が付与され title に参加者名を必ず含む", async () => {
      setCardGeneratorForTest(
        stubGen(async () => ({
          title: "謎の戦士",
          rarity: "R",
          attribute: "光",
          race: "戦士",
          flavor: "f",
          attack: 100,
          defense: 100,
        })),
      );

      const result = await cardService.generateAndPersist(eventId, {
        name: "デイブ",
        answers: {},
        customAnswer: null,
      });

      expect(result.card.title).toContain("デイブ");
    });

    it("Adapter 応答の title に既に参加者名が含まれる場合、そのまま採用される（名前が二重に付与されない）", async () => {
      setCardGeneratorForTest(
        stubGen(async () => ({
          title: "炎のヒロ",
          rarity: "R",
          attribute: "火",
          race: "戦士",
          flavor: "f",
          attack: 100,
          defense: 100,
        })),
      );

      const result = await cardService.generateAndPersist(eventId, {
        name: "ヒロ",
        answers: {},
        customAnswer: null,
      });

      expect(result.card.title).toBe("炎のヒロ");
      // 名前が二重に出現していないこと（"ヒロ" の出現回数が 1 回）
      const matches = result.card.title.split("ヒロ").length - 1;
      expect(matches).toBe(1);
    });

    it("Adapter 応答の flavor に含まれる改行 / タブ / 制御文字（\\n, \\r, \\t, U+0000-U+001F, U+007F）は半角スペースに置換される", async () => {
      setCardGeneratorForTest(
        stubGen(async () => ({
          title: "戦士",
          rarity: "R",
          attribute: "光",
          race: "戦士",
          flavor: "行1\n行2\r行3\t行4末",
          attack: 100,
          defense: 100,
        })),
      );

      const result = await cardService.generateAndPersist(eventId, {
        name: "イブ",
        answers: {},
        customAnswer: null,
      });

      expect(result.card.flavor).not.toContain("\n");
      expect(result.card.flavor).not.toContain("\r");
      expect(result.card.flavor).not.toContain("\t");
      expect(result.card.flavor).toContain(" ");
    });
  });

  /**
   * C. 数値クランプ — attack / defense
   *
   * 観点:
   *  - 0 未満は 0 に丸める
   *  - 上限超（9999 想定）は上限値に丸める
   */
  describe("C. 数値クランプ — attack / defense は 0 以上、上限以内", () => {
    it("Adapter 応答の attack が負数の場合、0 にクランプされる", async () => {
      setCardGeneratorForTest(
        stubGen(async () => ({
          title: "戦士",
          rarity: "R",
          attribute: "光",
          race: "戦士",
          flavor: "f",
          attack: -100,
          defense: 100,
        })),
      );

      const result = await cardService.generateAndPersist(eventId, {
        name: "フランク",
        answers: {},
        customAnswer: null,
      });

      expect(result.card.attack).toBe(0);
    });

    it("Adapter 応答の attack / defense が 9999 を超える場合、9999 にクランプされる", async () => {
      setCardGeneratorForTest(
        stubGen(async () => ({
          title: "戦士",
          rarity: "R",
          attribute: "光",
          race: "戦士",
          flavor: "f",
          attack: 999999,
          defense: 999999,
        })),
      );

      const result = await cardService.generateAndPersist(eventId, {
        name: "グレース",
        answers: {},
        customAnswer: null,
      });

      expect(result.card.attack).toBe(9999);
      expect(result.card.defense).toBe(9999);
    });
  });

  /**
   * D. Tier 2 テンプレート — 名前ハッシュで決定論的に抽選
   *
   * 観点:
   *  - 同一参加者名 → 同一テンプレ（再現性）
   *  - 異なる名前で異なるテンプレが当たり得る（最低 8 種類の存在）
   *  - 二つ名にはいずれのテンプレでも参加者名が含まれる
   */
  describe("D. Tier 2 テンプレート — 名前ハッシュによる決定論的抽選", () => {
    it("Tier 2 テンプレで同じ参加者名は常に同じテンプレ二つ名が当たる（決定論的）", async () => {
      setCardGeneratorForTest(
        stubGen(async () => {
          throw new TransientError("timeout");
        }),
      );

      const r1 = await cardService.generateAndPersist(eventId, {
        name: "同名",
        answers: {},
        customAnswer: null,
      });
      const r2 = await cardService.generateAndPersist(eventId, {
        name: "同名",
        answers: {},
        customAnswer: null,
      });

      expect(r1.card.title).toBe(r2.card.title);
    });
  });

  /**
   * E. Tier 3 既定値 — クォータ枯渇時の最低限カード
   *
   * 観点:
   *  - 二つ名は参加者名そのまま
   *  - レアリティ / 属性 / 種族 / フレーバー / 攻撃力 / 守備力 は固定の最低限値
   */
  describe("E. Tier 3 既定値 — QuotaExhausted 時の最低限カード", () => {
    it("Tier 3 既定値は二つ名 = 名前のみ、他属性は最低限定数", async () => {
      setCardGeneratorForTest(
        stubGen(async () => {
          throw new QuotaExhaustedError("q");
        }),
      );

      const result = await cardService.generateAndPersist(eventId, {
        name: "ミニマム",
        answers: {},
        customAnswer: null,
      });

      expect(result.card.tier).toBe("default");
      expect(result.card.title).toBe("ミニマム");
      expect(result.card.attack).toBe(0);
      expect(result.card.defense).toBe(0);
    });
  });
});
