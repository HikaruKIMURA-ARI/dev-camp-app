import { beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { addResponse, addResponseWithCard, createEvent, getEventWithOptions, db } from "./db";
import {
  eventOptionResponses,
  eventOptions,
  eventResponses,
  events,
  participantCards,
} from "./schema";

/**
 * Phase 3 で `src/db.ts` に追加予定の API の型シェイプを、テストファイル側で局所的に表現する。
 * これは「設計の前提」セクションのコメントに記載した型と同じ。テスト本体で `result.card.title` 等を
 * 参照するときに `any` ではなく実際の構造に型付けされた値を扱うための補助型。
 * Phase 3 で `src/db.ts` から `PersistedCard` を export したら、このローカル型は削除して
 * 公式型を import するようにする。
 */
type Tier = "ai" | "template" | "default";
type AddResponseWithCardResult = {
  responseId: number;
  card: {
    responseId: number;
    title: string;
    rarity: string;
    attribute: string;
    race: string;
    flavor: string;
    attack: number;
    defense: number;
    tier: Tier;
  };
};
const addResponseWithCardTyped = addResponseWithCard as (
  eventId: string,
  input: {
    response: {
      name: string;
      answers: Record<string, "○" | "△" | "×">;
      customAnswer?: string | null;
    };
    card: {
      title: string;
      rarity: string;
      attribute: string;
      race: string;
      flavor: string;
      attack: number;
      defense: number;
      tier: Tier;
    };
  },
) => Promise<AddResponseWithCardResult>;

/**
 * Task 2.2: Repository の拡張 — 同一トランザクション書き込みとカード結合読み出し
 *
 * 対象（src/db.ts への追加 / 拡張）:
 *  - 新規 `addResponseWithCard(eventId, input)` — 回答 + 候補別回答 + 参加者カードを 1 トランザクションで一括書き込み
 *  - 既存 `getEventWithOptions(eventId)` — 戻り値の `responses[i]` に `card: PersistedCard | null` を持つ交差型に拡張
 *  - 既存 `addResponse` は当面残置（後方互換）
 *
 * スコープ外:
 *  - Card Service の Tier 判定 / サニタイズ / クランプ（Task 2.3 で別ファイル）
 *  - Gemini Adapter（Task 2.1 で別ファイル）
 *  - routes 経由のフラグメント返却（Task 3.1 で routes.test.ts）
 *  - views の DOM 検証（Task 3.2 で routes.test.ts / e2e）
 *
 * 設計の前提（古典派 TDD + .claude/rules/testing/test-philosophy.md）:
 *  - DB は実体（`.env.test` の `file::memory:?cache=shared` に接続済みの drizzle インスタンス）を使う
 *  - テスト間の隔離は `beforeEach` で `participant_cards` → `event_option_responses` →
 *    `event_responses` → `event_options` → `events` の **子 → 親順** に delete する
 *  - Arrange（イベント + 候補の seed）は `beforeEach` 内に置き、`it` 内では Act / Assert のみ
 *
 * 参照:
 *  - 要件: Requirement 5.3, 5.4（.kiro/specs/tyousei-ph2/requirements.md）
 *  - 設計: Repository 追加 IF / Props 互換戦略（.kiro/specs/tyousei-ph2/design.md）
 */

describe("src/db.ts — 参加者カード拡張（Task 2.2）", () => {
  let eventId: string;
  let optionIds: number[];

  beforeEach(async () => {
    await db.delete(participantCards);
    await db.delete(eventOptionResponses);
    await db.delete(eventResponses);
    await db.delete(eventOptions);
    await db.delete(events);

    const { id } = await createEvent({
      title: "テスト",
      options: ["18:00", "19:00"],
      customQuestion: null,
    });
    eventId = id;
    const opts = await db.select().from(eventOptions).where(eq(eventOptions.eventId, id));
    optionIds = opts.map((o) => o.id).sort((a, b) => a - b);
  });

  /**
   * A. `addResponseWithCard` の書き込みアトミック性と戻り値
   *
   * 観点:
   *  - 3 テーブル（event_responses / event_option_responses / participant_cards）の同時 INSERT
   *  - 戻り値の `responseId` と `card.responseId` の一致
   *  - 入力した 7 属性 + tier がそのまま戻り値 / DB に保持される
   *  - Tier 種別ごとに保存できる
   *  - 答えが 0 件でも回答 + カードは作成される（カスタム回答のみのケース）
   */
  describe("addResponseWithCard — 同一トランザクション書き込み（要件 5.4）", () => {
    it("回答 + 候補別回答 + 参加者カードが 1 件ずつ同時に INSERT される（3 テーブルが atomic に増える）", async () => {
      // Act
      await addResponseWithCardTyped(eventId, {
        response: {
          name: "アリス",
          answers: { [String(optionIds[0])]: "○", [String(optionIds[1])]: "×" },
          customAnswer: null,
        },
        card: {
          title: "炎の戦士アリス",
          rarity: "SR",
          attribute: "火",
          race: "戦士",
          flavor: "勇敢な戦士",
          attack: 1500,
          defense: 1200,
          tier: "ai",
        },
      });

      // Assert
      const responses = await db.select().from(eventResponses);
      const optResponses = await db.select().from(eventOptionResponses);
      const cards = await db.select().from(participantCards);
      expect(responses.length).toBe(1);
      expect(optResponses.length).toBe(2);
      expect(cards.length).toBe(1);
    });

    it("戻り値の responseId と card.responseId が一致し、event_responses に存在する id を指す", async () => {
      // Act
      const result = await addResponseWithCardTyped(eventId, {
        response: { name: "ボブ", answers: {}, customAnswer: null },
        card: {
          title: "氷の魔法使いボブ",
          rarity: "R",
          attribute: "水",
          race: "魔法使い",
          flavor: "静かな知性",
          attack: 800,
          defense: 1500,
          tier: "template",
        },
      });

      // Assert
      expect(result.responseId).toBeGreaterThan(0);
      expect(result.card.responseId).toBe(result.responseId);
      const rows = await db
        .select()
        .from(eventResponses)
        .where(eq(eventResponses.id, result.responseId));
      expect(rows.length).toBe(1);
    });

    it("戻り値の card に入力した 7 属性（title/rarity/attribute/race/flavor/attack/defense）がそのまま反映される", async () => {
      // Act
      const result = await addResponseWithCardTyped(eventId, {
        response: { name: "キャロル", answers: {}, customAnswer: null },
        card: {
          title: "光の戦士キャロル",
          rarity: "UR",
          attribute: "光",
          race: "戦士",
          flavor: "希望の象徴",
          attack: 2500,
          defense: 2100,
          tier: "ai",
        },
      });

      // Assert
      expect(result.card.title).toBe("光の戦士キャロル");
      expect(result.card.rarity).toBe("UR");
      expect(result.card.attribute).toBe("光");
      expect(result.card.race).toBe("戦士");
      expect(result.card.flavor).toBe("希望の象徴");
      expect(result.card.attack).toBe(2500);
      expect(result.card.defense).toBe(2100);
      expect(result.card.tier).toBe("ai");
    });
  });

  /**
   * B. アトミック性（同一トランザクション保証）（要件 5.4）
   *
   * 観点:
   *  - カード書き込み側で失敗が起きた場合、回答も巻き戻る（片肺にならない）
   *  - 観察可能な方法: 存在しない eventId を渡して FK 違反を起こし、
   *    その後 event_responses / participant_cards の件数が 0 のままであることを確認する
   *
   * Note: Drizzle で外部 INSERT エラーを意図的に起こすのは難しいため、
   *       実現困難ならスキップ可（task.md の B 記載どおり）
   */
  describe("addResponseWithCard — ロールバック（要件 5.4）", () => {
    it("存在しない eventId を渡すと例外を投げ、event_responses にも participant_cards にも行が残らない", async () => {
      // Act
      let caught: unknown;
      try {
        await addResponseWithCardTyped("non-existent-event-id-12345", {
          response: { name: "ghost", answers: {}, customAnswer: null },
          card: {
            title: "ghost-card",
            rarity: "N",
            attribute: "闇",
            race: "アンデッド",
            flavor: "no-event",
            attack: 0,
            defense: 0,
            tier: "default",
          },
        });
      } catch (e) {
        caught = e;
      }

      // Assert
      expect(caught).toBeDefined();
      const responses = await db.select().from(eventResponses);
      const cards = await db.select().from(participantCards);
      expect(responses.length).toBe(0);
      expect(cards.length).toBe(0);
    });
  });

  /**
   * C. `getEventWithOptions` のカード結合読み出し（要件 5.3）
   *
   * 観点:
   *  - カードが紐づいている回答は responses[i].card に PersistedCard を持つ
   *  - カードが紐づいていない回答（addResponse 経由で作った既存回答）は responses[i].card === null
   *  - 並び順は event_responses.id ASC（回答送信順）を保持
   *  - card の 7 属性 + tier が読み出し時にそのまま復元される
   *  - 既存 answers プロパティは保持される（後方互換）
   */
  describe("getEventWithOptions — カード結合読み出し（要件 5.3）", () => {
    it("addResponseWithCard で書いた回答は responses[i].card に PersistedCard を持つ（null ではない）", async () => {
      // Act
      await addResponseWithCardTyped(eventId, {
        response: { name: "アリス", answers: {}, customAnswer: null },
        card: {
          title: "炎の戦士アリス",
          rarity: "SR",
          attribute: "火",
          race: "戦士",
          flavor: "勇敢",
          attack: 1500,
          defense: 1200,
          tier: "ai",
        },
      });

      // Assert
      const result = await getEventWithOptions(eventId);
      expect(result).not.toBeNull();
      const card = (result!.responses[0] as any).card;
      expect(card).not.toBeNull();
      expect(card.title).toBe("炎の戦士アリス");
    });

    it("addResponse で書いたカード未紐付けの回答は responses[i].card === null になる", async () => {
      // Act
      await addResponse(eventId, { name: "ボブ", answers: {}, customAnswer: null });

      // Assert
      const result = await getEventWithOptions(eventId);
      const card = (result!.responses[0] as any).card;
      expect(card).toBeNull();
    });

    it("responses[i].card.responseId は responses[i].id と一致する", async () => {
      // Act
      await addResponseWithCardTyped(eventId, {
        response: { name: "キャロル", answers: {}, customAnswer: null },
        card: {
          title: "光のキャロル",
          rarity: "UR",
          attribute: "光",
          race: "戦士",
          flavor: "希望",
          attack: 2500,
          defense: 2100,
          tier: "ai",
        },
      });

      // Assert
      const result = await getEventWithOptions(eventId);
      const r = result!.responses[0] as any;
      expect(r.card.responseId).toBe(r.id);
    });
  });

  /**
   * D. 既存挙動の後方互換（Props 互換戦略 / 要件 5.3）
   *
   * 観点:
   *  - 既存 `addResponse` 関数は引き続き動作する
   *  - `getEventWithOptions` 戻り値の event / options / aggregates 構造は維持
   *  - `responses[i].answers` プロパティが従来通り存在する（card プロパティの追加で壊れない）
   *  - aggregates 集計値がカード結合で変わらない（重複 JOIN によるノイズが入らない）
   */
  describe("既存挙動の後方互換（Props 互換戦略 / 要件 5.3）", () => {
    it("既存 addResponse は変更なく、カード未紐付けの回答を作れる（戻り値 responseId が返る）", async () => {
      // Act
      const { responseId } = await addResponse(eventId, {
        name: "Bob",
        answers: { [String(optionIds[0])]: "○" },
        customAnswer: null,
      });

      // Assert
      expect(responseId).toBeGreaterThan(0);
      const cards = await db.select().from(participantCards);
      expect(cards.length).toBe(0);
    });

    it("aggregates の circle / triangle / cross 集計値はカード結合で変化しない（カード有無で同じ集計）", async () => {
      // Act
      await addResponse(eventId, {
        name: "withoutCard",
        answers: { [String(optionIds[0])]: "○", [String(optionIds[1])]: "△" },
        customAnswer: null,
      });
      await addResponseWithCardTyped(eventId, {
        response: {
          name: "withCard",
          answers: { [String(optionIds[0])]: "○", [String(optionIds[1])]: "△" },
          customAnswer: null,
        },
        card: {
          title: "C",
          rarity: "N",
          attribute: "光",
          race: "戦士",
          flavor: "f",
          attack: 1,
          defense: 1,
          tier: "default",
        },
      });

      // Assert
      const result = await getEventWithOptions(eventId);
      expect(result).not.toBeNull();
      const agg0 = result!.aggregates[String(optionIds[0])];
      const agg1 = result!.aggregates[String(optionIds[1])];
      expect(agg0).toEqual({ circle: 2, triangle: 0, cross: 0 });
      expect(agg1).toEqual({ circle: 0, triangle: 2, cross: 0 });
    });
  });
});
