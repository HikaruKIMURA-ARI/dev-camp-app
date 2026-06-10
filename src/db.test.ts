import { beforeEach, describe, expect, it } from "bun:test";
import { asc, eq } from "drizzle-orm";
import {
  addResponse,
  addResponseWithCard,
  createEvent,
  db,
  getEventWithOptions,
  updateResponse,
} from "./db";
import {
  eventCustomAnswers,
  eventCustomQuestions,
  eventOptionResponses,
  eventOptions,
  eventResponses,
  events,
  participantCards,
} from "./schema";

/**
 * Phase 2 (RED) — 新シグネチャの局所型補助。
 * Phase 3 で `src/db.ts` の `CreateEventInput` が
 *   { title; options; customQuestions: string[]; description? }
 * に置き換わったら、このローカル型は削除して公式型を import する。
 */
type CreateEventNewInput = {
  title: string;
  options: string[];
  customQuestions: string[];
  description?: string | null;
};
const createEventNew = createEvent as unknown as (
  input: CreateEventNewInput,
) => Promise<{ id: string }>;

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

// TODO(new-spec): 旧仕様。Phase 3 で削除・置き換え予定
// 配下の it は customQuestion / customAnswer を直接利用しているため、
// 新スキーマ（event_custom_questions / event_custom_answers / event_responses.comment）への移行時に削除・更新する。
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
      await addResponse(eventId, {
        name: "ボブ",
        answers: {},
        customAnswer: null,
      });

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

/**
 * イベント作成者コメント（description）— Repository レイヤ
 *
 * 対象（src/db.ts への追加 / 拡張）:
 *  - 既存 `createEvent({ title, options, customQuestion })` に
 *    `description: string | null` を任意フィールドとして増やす（nullable text カラム）
 *  - 既存 `getEventWithOptions(eventId)` の戻り値 `event` に `description: string | null` を含める
 *
 * 設計の前提:
 *  - DB は実体（古典派）。`beforeEach` で events / event_options を子→親順に truncate
 *  - description 未指定 / null / 空文字の正規化方針は customQuestion と同じく「`null` で保存」
 *    （ルーター層が空文字 → null に正規化する場合でも、Repository は受け取った値で書き込み、
 *     読み出し時に同じ値を返すことだけを担保する）
 */
// TODO(new-spec): 旧仕様。Phase 3 で削除・置き換え予定
// 配下の it は createEvent({ customQuestion }) を直接利用しているため、
// 新スキーマ（複数カスタム設問: customQuestions[]）への移行時に削除・更新する。
describe("src/db.ts — イベント説明文（description）", () => {
  beforeEach(async () => {
    await db.delete(participantCards);
    await db.delete(eventOptionResponses);
    await db.delete(eventResponses);
    await db.delete(eventOptions);
    await db.delete(events);
  });

  /**
   * 観点:
   *  - 通常文字列を渡すと events.description にそのまま保存される
   *  - 改行を含む文字列を渡すと改行を保持したまま保存される
   *  - description を未指定（undefined）で渡すと events.description は null として保存される
   *  - description に null を明示的に渡すと events.description は null として保存される
   *  - 2000 文字（上限ぎりぎり）でも例外を投げずに保存できる
   *  - `getEventWithOptions` の戻り値 `event.description` に保存値がそのまま含まれる
   *  - description が null のイベントを読み出すと `event.description === null` が返る
   *  - 既存の customQuestion / options 周りの動作は description カラム追加で壊れない（後方互換）
   */
  it("createEvent に通常文字列の description を渡すと events.description に同じ値が保存される", async () => {
    // Act
    const { id } = await createEvent({
      title: "歓送迎会の打ち合わせ",
      options: ["18:00"],
      customQuestion: null,
      description: "新メンバー歓迎のため、軽食を用意します。会場は本社 5F です。",
    });

    // Assert
    const [row] = await db.select().from(events).where(eq(events.id, id));
    expect(row?.description).toBe("新メンバー歓迎のため、軽食を用意します。会場は本社 5F です。");
  });
  it("createEvent に改行入りの description を渡すと改行を保持したまま events.description に保存される", async () => {
    // Act
    const { id } = await createEvent({
      title: "新年会",
      options: ["18:00"],
      customQuestion: null,
      description: "1 行目\n2 行目\n3 行目",
    });

    // Assert
    const [row] = await db.select().from(events).where(eq(events.id, id));
    expect(row?.description).toBe("1 行目\n2 行目\n3 行目");
  });
  it("createEvent で description を未指定（undefined）にすると events.description は null として保存される", async () => {
    // Act
    const { id } = await createEvent({
      title: "歓送迎会",
      options: ["18:00"],
      customQuestion: null,
    });

    // Assert
    const [row] = await db.select().from(events).where(eq(events.id, id));
    expect(row?.description).toBe(null);
  });
  it("createEvent で description に null を渡すと events.description は null として保存される", async () => {
    // Act
    const { id } = await createEvent({
      title: "歓送迎会",
      options: ["18:00"],
      customQuestion: null,
      description: null,
    });

    // Assert
    const [row] = await db.select().from(events).where(eq(events.id, id));
    expect(row?.description).toBe(null);
  });
  it("createEvent に 2000 文字の description を渡しても例外を投げず保存され、読み出しでも 2000 文字を維持する", async () => {
    // Arrange
    const longDescription = "あ".repeat(2000);

    // Act
    const { id } = await createEvent({
      title: "歓送迎会",
      options: ["18:00"],
      customQuestion: null,
      description: longDescription,
    });

    // Assert
    const [row] = await db.select().from(events).where(eq(events.id, id));
    expect(row?.description?.length).toBe(2000);
    expect(row?.description).toBe(longDescription);
  });
  it("getEventWithOptions の戻り値 event.description に createEvent で渡した description が含まれる", async () => {
    // Arrange
    const { id } = await createEvent({
      title: "歓送迎会",
      options: ["18:00"],
      customQuestion: null,
      description: "趣旨: 新メンバー歓迎",
    });

    // Act
    const data = await getEventWithOptions(id);

    // Assert
    expect(data?.event.description).toBe("趣旨: 新メンバー歓迎");
  });
  it("description が null で作成されたイベントを getEventWithOptions で読み出すと event.description が null になる", async () => {
    // Arrange
    const { id } = await createEvent({
      title: "歓送迎会",
      options: ["18:00"],
      customQuestion: null,
      description: null,
    });

    // Act
    const data = await getEventWithOptions(id);

    // Assert
    expect(data?.event.description).toBe(null);
  });
  it("description カラム追加後も既存 customQuestion / options 周りの永続化と読み出しは壊れない（後方互換）", async () => {
    // Arrange
    const { id } = await createEvent({
      title: "イベント A",
      options: ["18:00", "19:00"],
      customQuestion: "持参するもの",
      description: null,
    });

    // Act
    const data = await getEventWithOptions(id);

    // Assert
    expect(data?.event.title).toBe("イベント A");
    expect(data?.event.customQuestion).toBe("持参するもの");
    expect(data?.options.map((o) => o.label)).toEqual(["18:00", "19:00"]);
  });
});

/**
 * 新スキーマ: 複数カスタム設問 + 回答コメント（Phase 1: Test List）
 *
 * 対象（src/db.ts の API 変更）:
 *  - `createEvent({ title, options, customQuestions: string[], description? })`
 *  - `addResponse(eventId, { name, answers, customAnswers: Record<questionId, string>, comment })`
 *  - `addResponseWithCard(eventId, { response: {...}, card })`（customAnswers + comment 含む）
 *  - `updateResponse(eventId, responseId, { name, answers, customAnswers, comment })`
 *  - `getEventWithOptions(id)` 戻り値の拡張（customQuestions 配列 / 各 response の customAnswers + comment）
 *
 * 新スキーマ:
 *  - events.custom_question カラム削除 / event_responses.custom_answer カラム削除
 *  - event_custom_questions(id, event_id, question, sort_order)
 *  - event_custom_answers(id, response_id, question_id, answer)
 *  - event_responses.comment TEXT NULL を追加
 *
 * 既存データ全削除前提・後方互換不要。
 */
describe("src/db.ts — createEvent + 複数カスタム設問（新スキーマ）", () => {
  beforeEach(async () => {
    // 子 → 親順に truncate（FK 制約を踏まないよう）
    await db.delete(participantCards);
    await db.delete(eventOptionResponses);
    await db.delete(eventCustomAnswers);
    await db.delete(eventResponses);
    await db.delete(eventCustomQuestions);
    await db.delete(eventOptions);
    await db.delete(events);
  });

  it("customQuestions が空配列のとき event_custom_questions に 1 件も保存されない", async () => {
    // Act
    const { id } = await createEventNew({
      title: "設問なしイベント",
      options: ["18:00"],
      customQuestions: [],
    });

    // Assert
    const rows = await db
      .select()
      .from(eventCustomQuestions)
      .where(eq(eventCustomQuestions.eventId, id));
    expect(rows.length).toBe(0);
  });

  it("customQuestions が 1 件のとき event_custom_questions に sort_order=0 で 1 件保存される", async () => {
    // Act
    const { id } = await createEventNew({
      title: "設問 1 件イベント",
      options: ["18:00"],
      customQuestions: ["持参するもの"],
    });

    // Assert
    const rows = await db
      .select()
      .from(eventCustomQuestions)
      .where(eq(eventCustomQuestions.eventId, id));
    expect(rows.length).toBe(1);
    expect(rows[0]?.question).toBe("持参するもの");
    expect(rows[0]?.sortOrder).toBe(0);
  });

  it("customQuestions が複数件のとき配列順どおりに sort_order=0,1,2... で event_custom_questions に保存される", async () => {
    // Act
    const { id } = await createEventNew({
      title: "設問複数イベント",
      options: ["18:00"],
      customQuestions: ["持参するもの", "アレルギー", "備考"],
    });

    // Assert
    const rows = await db
      .select()
      .from(eventCustomQuestions)
      .where(eq(eventCustomQuestions.eventId, id))
      .orderBy(asc(eventCustomQuestions.sortOrder));
    expect(rows.map((r) => r.question)).toEqual(["持参するもの", "アレルギー", "備考"]);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1, 2]);
  });

  it("createEvent は events と event_custom_questions を同一トランザクションで書き込む（events だけ残るような中途半端な状態にならない）", async () => {
    // Arrange: options を空配列にすると drizzle の bulk insert がエラーになる
    // （SQL の `INSERT INTO ... VALUES ()` が値ゼロで成立しない）。
    // この失敗がトランザクション内で起きるため、同じトランザクションで先行した
    // events / event_custom_questions の INSERT は全てロールバックされるはず。
    let caught: unknown;

    // Act
    try {
      await createEventNew({
        title: "途中で失敗するイベント",
        options: [],
        customQuestions: ["A", "B"],
      });
    } catch (e) {
      caught = e;
    }

    // Assert
    expect(caught).toBeDefined();
    const eventsRows = await db.select().from(events);
    const questionsRows = await db.select().from(eventCustomQuestions);
    expect(eventsRows.length).toBe(0);
    expect(questionsRows.length).toBe(0);
  });
});

describe("src/db.ts — addResponse + 複数カスタム回答 + コメント（新スキーマ）", () => {
  /**
   * Phase 2 (RED) — 新シグネチャの局所型補助。
   * Phase 3 で `src/db.ts` の `addResponse` が新シグネチャに置き換わったら、
   * このローカル型は削除して公式型を import する。
   */
  const addResponseNew = addResponse as unknown as (
    eventId: string,
    input: {
      name: string;
      answers: Record<string, "○" | "△" | "×">;
      customAnswers: Record<string, string>;
      comment: string | null | undefined;
    },
  ) => Promise<{ responseId: number }>;

  let eventId: string;

  beforeEach(async () => {
    // 子 → 親順に truncate（FK 制約を踏まないよう）
    await db.delete(participantCards);
    await db.delete(eventOptionResponses);
    await db.delete(eventCustomAnswers);
    await db.delete(eventResponses);
    await db.delete(eventCustomQuestions);
    await db.delete(eventOptions);
    await db.delete(events);

    const { id } = await createEventNew({
      title: "コメント検証イベント",
      options: ["18:00"],
      customQuestions: [],
    });
    eventId = id;
  });

  it("設問 0 件のイベントで customAnswers が空オブジェクトでも回答が保存される（event_custom_answers は 0 件）", async () => {
    // Act
    const { responseId } = await addResponseNew(eventId, {
      name: "アリス",
      answers: {},
      customAnswers: {},
      comment: null,
    });

    // Assert
    expect(responseId).toBeGreaterThan(0);
    const answers = await db
      .select()
      .from(eventCustomAnswers)
      .where(eq(eventCustomAnswers.responseId, responseId));
    expect(answers.length).toBe(0);
  });

  it("設問 N 件のイベントで一部の questionId だけに回答した場合、回答した分だけ event_custom_answers に保存される", async () => {
    // Arrange: 設問 3 件のイベントを作って questionId を取得
    const { id: targetEventId } = await createEventNew({
      title: "設問複数イベント",
      options: ["18:00"],
      customQuestions: ["持参するもの", "アレルギー", "備考"],
    });
    const questions = await db
      .select()
      .from(eventCustomQuestions)
      .where(eq(eventCustomQuestions.eventId, targetEventId))
      .orderBy(asc(eventCustomQuestions.sortOrder));

    // Act: 3 件中 1 件目と 3 件目だけに回答
    const { responseId } = await addResponseNew(targetEventId, {
      name: "ボブ",
      answers: {},
      customAnswers: {
        [String(questions[0]!.id)]: "お茶",
        [String(questions[2]!.id)]: "特になし",
      },
      comment: null,
    });

    // Assert
    const rows = await db
      .select()
      .from(eventCustomAnswers)
      .where(eq(eventCustomAnswers.responseId, responseId));
    expect(rows.length).toBe(2);
    const savedQuestionIds = rows.map((r) => r.questionId).sort((a, b) => a - b);
    expect(savedQuestionIds).toEqual([questions[0]!.id, questions[2]!.id]);
  });

  it("customAnswers の各 (questionId, 回答) ペアが event_custom_answers に response_id と紐づけて保存される", async () => {
    // Arrange
    const { id: targetEventId } = await createEventNew({
      title: "ペア検証イベント",
      options: ["18:00"],
      customQuestions: ["持参するもの", "アレルギー"],
    });
    const questions = await db
      .select()
      .from(eventCustomQuestions)
      .where(eq(eventCustomQuestions.eventId, targetEventId))
      .orderBy(asc(eventCustomQuestions.sortOrder));

    // Act
    const { responseId } = await addResponseNew(targetEventId, {
      name: "キャロル",
      answers: {},
      customAnswers: {
        [String(questions[0]!.id)]: "ワイン",
        [String(questions[1]!.id)]: "卵アレルギー",
      },
      comment: null,
    });

    // Assert
    const rows = await db
      .select()
      .from(eventCustomAnswers)
      .where(eq(eventCustomAnswers.responseId, responseId))
      .orderBy(asc(eventCustomAnswers.questionId));
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.responseId === responseId)).toBe(true);
    const pairs = rows
      .map((r) => ({ questionId: r.questionId, answer: r.answer }))
      .sort((a, b) => a.questionId - b.questionId);
    const expected = [
      { questionId: questions[0]!.id, answer: "ワイン" },
      { questionId: questions[1]!.id, answer: "卵アレルギー" },
    ].sort((a, b) => a.questionId - b.questionId);
    expect(pairs).toEqual(expected);
  });

  it("comment に文字列を渡すと event_responses.comment にそのまま保存される", async () => {
    // Act
    await addResponseNew(eventId, {
      name: "アリス",
      answers: {},
      customAnswers: {},
      comment: "よろしくお願いします",
    });

    // Assert
    const rows = await db.select().from(eventResponses).where(eq(eventResponses.eventId, eventId));
    expect(rows.length).toBe(1);
    expect((rows[0] as unknown as { comment: string | null }).comment).toBe("よろしくお願いします");
  });

  it("comment が空文字 ('') のとき event_responses.comment は null として保存される", async () => {
    // Act
    await addResponseNew(eventId, {
      name: "ボブ",
      answers: {},
      customAnswers: {},
      comment: "",
    });

    // Assert
    const rows = await db.select().from(eventResponses).where(eq(eventResponses.eventId, eventId));
    expect(rows.length).toBe(1);
    expect((rows[0] as unknown as { comment: string | null }).comment).toBe(null);
  });

  it("comment が null のとき event_responses.comment は null として保存される", async () => {
    // Act
    await addResponseNew(eventId, {
      name: "キャロル",
      answers: {},
      customAnswers: {},
      comment: null,
    });

    // Assert
    const rows = await db.select().from(eventResponses).where(eq(eventResponses.eventId, eventId));
    expect(rows.length).toBe(1);
    expect((rows[0] as unknown as { comment: string | null }).comment).toBe(null);
  });

  it("comment が undefined（未指定）のとき event_responses.comment は null として保存される", async () => {
    // Act
    await addResponseNew(eventId, {
      name: "デイブ",
      answers: {},
      customAnswers: {},
      comment: undefined,
    });

    // Assert
    const rows = await db.select().from(eventResponses).where(eq(eventResponses.eventId, eventId));
    expect(rows.length).toBe(1);
    expect((rows[0] as unknown as { comment: string | null }).comment).toBe(null);
  });
});

describe("src/db.ts — addResponseWithCard + 複数カスタム回答 + コメント（新スキーマ）", () => {
  /**
   * Phase 2 (RED) — 新シグネチャの局所型補助。
   * Phase 3 で `src/db.ts` の `addResponseWithCard` 入力が新シグネチャ
   *   { response: { ..., customAnswers, comment? }, card }
   * に置き換わったら、このローカル型は削除して公式型を import する。
   */
  const addResponseWithCardNew = addResponseWithCard as unknown as (
    eventId: string,
    input: {
      response: {
        name: string;
        answers: Record<string, "○" | "△" | "×">;
        customAnswers: Record<string, string>;
        comment?: string | null;
      };
      card: {
        title: string;
        rarity: string;
        attribute: string;
        race: string;
        flavor: string;
        attack: number;
        defense: number;
        tier: "ai" | "template" | "default";
      };
    },
  ) => Promise<{ responseId: number; card: { responseId: number } }>;

  let eventId: string;
  let optionIds: number[];
  let questionIds: number[];

  beforeEach(async () => {
    // 子 → 親順に truncate（FK 制約を踏まないよう）
    await db.delete(participantCards);
    await db.delete(eventOptionResponses);
    await db.delete(eventCustomAnswers);
    await db.delete(eventResponses);
    await db.delete(eventCustomQuestions);
    await db.delete(eventOptions);
    await db.delete(events);

    const { id } = await createEventNew({
      title: "addResponseWithCard 検証",
      options: ["18:00", "19:00"],
      customQuestions: ["持参するもの", "アレルギー"],
    });
    eventId = id;
    const opts = await db.select().from(eventOptions).where(eq(eventOptions.eventId, id));
    optionIds = opts.map((o) => o.id).sort((a, b) => a - b);
    const questions = await db
      .select()
      .from(eventCustomQuestions)
      .where(eq(eventCustomQuestions.eventId, id))
      .orderBy(asc(eventCustomQuestions.sortOrder));
    questionIds = questions.map((q) => q.id);
  });

  it("event_responses / event_option_responses / event_custom_answers / participant_cards を同一トランザクションで書き込む", async () => {
    // Act
    await addResponseWithCardNew(eventId, {
      response: {
        name: "アリス",
        answers: { [String(optionIds[0])]: "○", [String(optionIds[1])]: "×" },
        customAnswers: {
          [String(questionIds[0])]: "ワイン",
          [String(questionIds[1])]: "卵",
        },
        comment: "よろしく",
      },
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
    const responses = await db.select().from(eventResponses);
    const optResponses = await db.select().from(eventOptionResponses);
    const customAnswers = await db.select().from(eventCustomAnswers);
    const cards = await db.select().from(participantCards);
    expect(responses.length).toBe(1);
    expect(optResponses.length).toBe(2);
    expect(customAnswers.length).toBe(2);
    expect(cards.length).toBe(1);
  });

  it("customAnswers の内容が event_custom_answers に response_id と紐づけて保存される", async () => {
    // Act
    const { responseId } = await addResponseWithCardNew(eventId, {
      response: {
        name: "ボブ",
        answers: {},
        customAnswers: {
          [String(questionIds[0])]: "ジュース",
          [String(questionIds[1])]: "なし",
        },
        comment: null,
      },
      card: {
        title: "水のボブ",
        rarity: "R",
        attribute: "水",
        race: "魔法使い",
        flavor: "静か",
        attack: 800,
        defense: 1500,
        tier: "template",
      },
    });

    // Assert
    const rows = await db
      .select()
      .from(eventCustomAnswers)
      .where(eq(eventCustomAnswers.responseId, responseId))
      .orderBy(asc(eventCustomAnswers.questionId));
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.responseId === responseId)).toBe(true);
    const pairs = rows
      .map((r) => ({ questionId: r.questionId, answer: r.answer }))
      .sort((a, b) => a.questionId - b.questionId);
    const expected = [
      { questionId: questionIds[0]!, answer: "ジュース" },
      { questionId: questionIds[1]!, answer: "なし" },
    ].sort((a, b) => a.questionId - b.questionId);
    expect(pairs).toEqual(expected);
  });

  it("comment が event_responses.comment に保存される（文字列 / null の両方）", async () => {
    // Act
    const { responseId: id1 } = await addResponseWithCardNew(eventId, {
      response: {
        name: "コメント有り",
        answers: {},
        customAnswers: {},
        comment: "楽しみにしています",
      },
      card: {
        title: "c1",
        rarity: "N",
        attribute: "光",
        race: "戦士",
        flavor: "f",
        attack: 1,
        defense: 1,
        tier: "default",
      },
    });
    const { responseId: id2 } = await addResponseWithCardNew(eventId, {
      response: {
        name: "コメント無し",
        answers: {},
        customAnswers: {},
        comment: null,
      },
      card: {
        title: "c2",
        rarity: "N",
        attribute: "闇",
        race: "戦士",
        flavor: "f",
        attack: 1,
        defense: 1,
        tier: "default",
      },
    });

    // Assert
    const [row1] = await db.select().from(eventResponses).where(eq(eventResponses.id, id1));
    const [row2] = await db.select().from(eventResponses).where(eq(eventResponses.id, id2));
    expect((row1 as unknown as { comment: string | null }).comment).toBe("楽しみにしています");
    expect((row2 as unknown as { comment: string | null }).comment).toBe(null);
  });
});

describe("src/db.ts — updateResponse（新スキーマ）", () => {
  /**
   * Phase 2 (RED) — 新シグネチャの局所型補助。
   * Phase 3 で `src/db.ts` の `updateResponse` が新シグネチャに置き換わったら、
   * このローカル型は削除して公式型を import する。
   */
  const updateResponseNew = updateResponse as unknown as (
    eventId: string,
    responseId: number,
    input: {
      name: string;
      answers: Record<string, "○" | "△" | "×">;
      customAnswers: Record<string, string>;
      comment: string | null | undefined;
    },
  ) => Promise<boolean>;
  const addResponseNew = addResponse as unknown as (
    eventId: string,
    input: {
      name: string;
      answers: Record<string, "○" | "△" | "×">;
      customAnswers: Record<string, string>;
      comment: string | null | undefined;
    },
  ) => Promise<{ responseId: number }>;

  let eventId: string;
  let optionIds: number[];
  let questionIds: number[];

  beforeEach(async () => {
    // 子 → 親順に truncate（FK 制約を踏まないよう）
    await db.delete(participantCards);
    await db.delete(eventOptionResponses);
    await db.delete(eventCustomAnswers);
    await db.delete(eventResponses);
    await db.delete(eventCustomQuestions);
    await db.delete(eventOptions);
    await db.delete(events);

    const { id } = await createEventNew({
      title: "updateResponse 検証",
      options: ["18:00", "19:00"],
      customQuestions: ["持参するもの", "アレルギー"],
    });
    eventId = id;
    const opts = await db.select().from(eventOptions).where(eq(eventOptions.eventId, id));
    optionIds = opts.map((o) => o.id).sort((a, b) => a - b);
    const questions = await db
      .select()
      .from(eventCustomQuestions)
      .where(eq(eventCustomQuestions.eventId, id))
      .orderBy(asc(eventCustomQuestions.sortOrder));
    questionIds = questions.map((q) => q.id);
  });

  it("既存回答の comment を新しい文字列に更新できる", async () => {
    // Arrange: 旧コメントで保存された既存回答
    const { responseId } = await addResponseNew(eventId, {
      name: "アリス",
      answers: {},
      customAnswers: {},
      comment: "旧コメント",
    });

    // Act
    await updateResponseNew(eventId, responseId, {
      name: "アリス",
      answers: {},
      customAnswers: {},
      comment: "新しいコメント",
    });

    // Assert
    const [row] = await db.select().from(eventResponses).where(eq(eventResponses.id, responseId));
    expect((row as unknown as { comment: string | null }).comment).toBe("新しいコメント");
  });

  it("既存回答の comment を null に更新できる", async () => {
    // Arrange
    const { responseId } = await addResponseNew(eventId, {
      name: "ボブ",
      answers: {},
      customAnswers: {},
      comment: "削除予定",
    });

    // Act
    await updateResponseNew(eventId, responseId, {
      name: "ボブ",
      answers: {},
      customAnswers: {},
      comment: null,
    });

    // Assert
    const [row] = await db.select().from(eventResponses).where(eq(eventResponses.id, responseId));
    expect((row as unknown as { comment: string | null }).comment).toBe(null);
  });

  it("既存の event_custom_answers レコードは delete-then-insert で置換される（更新前の回答が残らない）", async () => {
    // Arrange: 設問 0 と 1 に旧回答を保存
    const { responseId } = await addResponseNew(eventId, {
      name: "キャロル",
      answers: {},
      customAnswers: {
        [String(questionIds[0])]: "旧回答 0",
        [String(questionIds[1])]: "旧回答 1",
      },
      comment: null,
    });

    // Act: 設問 0 のみ新しい回答に。設問 1 は除外
    await updateResponseNew(eventId, responseId, {
      name: "キャロル",
      answers: {},
      customAnswers: {
        [String(questionIds[0])]: "新回答 0",
      },
      comment: null,
    });

    // Assert: 設問 0 のみ、しかも値は新しいものに置き換わっている
    const rows = await db
      .select()
      .from(eventCustomAnswers)
      .where(eq(eventCustomAnswers.responseId, responseId));
    expect(rows.length).toBe(1);
    expect(rows[0]?.questionId).toBe(questionIds[0]!);
    expect(rows[0]?.answer).toBe("新回答 0");
  });

  it("customAnswers を空オブジェクトに更新すると event_custom_answers が 0 件になる", async () => {
    // Arrange
    const { responseId } = await addResponseNew(eventId, {
      name: "デイブ",
      answers: {},
      customAnswers: {
        [String(questionIds[0])]: "回答",
        [String(questionIds[1])]: "回答 2",
      },
      comment: null,
    });

    // Act
    await updateResponseNew(eventId, responseId, {
      name: "デイブ",
      answers: {},
      customAnswers: {},
      comment: null,
    });

    // Assert
    const rows = await db
      .select()
      .from(eventCustomAnswers)
      .where(eq(eventCustomAnswers.responseId, responseId));
    expect(rows.length).toBe(0);
  });

  it("answers / customAnswers / comment の更新は同一トランザクションで行われる", async () => {
    // Arrange: 旧 answers / customAnswers / comment を保存
    const { responseId } = await addResponseNew(eventId, {
      name: "エミリー",
      answers: { [String(optionIds[0])]: "○" },
      customAnswers: { [String(questionIds[0])]: "旧 q0" },
      comment: "旧コメント",
    });

    // Act: 存在しない questionId を混ぜて FK 違反でロールバックさせる
    let caught: unknown;
    try {
      await updateResponseNew(eventId, responseId, {
        name: "エミリー（更新後）",
        answers: { [String(optionIds[0])]: "△" },
        customAnswers: {
          [String(questionIds[0])]: "新 q0",
          "999999": "存在しない設問への回答",
        },
        comment: "新コメント",
      });
    } catch (e) {
      caught = e;
    }

    // Assert: 例外が投げられ、旧データは全てそのまま残る（部分的に更新されていない）
    expect(caught).toBeDefined();
    const [row] = await db.select().from(eventResponses).where(eq(eventResponses.id, responseId));
    expect(row?.name).toBe("エミリー");
    expect((row as unknown as { comment: string | null }).comment).toBe("旧コメント");
    const caRows = await db
      .select()
      .from(eventCustomAnswers)
      .where(eq(eventCustomAnswers.responseId, responseId));
    expect(caRows.map((r) => r.answer)).toEqual(["旧 q0"]);
  });
});

describe("src/db.ts — getEventWithOptions（新スキーマ）", () => {
  /**
   * Phase 2 (RED) — 新シグネチャの局所型補助。
   * Phase 3 で `src/db.ts` の `addResponse` が新シグネチャに置き換わったら削除する。
   */
  const addResponseNew = addResponse as unknown as (
    eventId: string,
    input: {
      name: string;
      answers: Record<string, "○" | "△" | "×">;
      customAnswers: Record<string, string>;
      comment: string | null | undefined;
    },
  ) => Promise<{ responseId: number }>;

  beforeEach(async () => {
    // 子 → 親順に truncate（FK 制約を踏まないよう）
    await db.delete(participantCards);
    await db.delete(eventOptionResponses);
    await db.delete(eventCustomAnswers);
    await db.delete(eventResponses);
    await db.delete(eventCustomQuestions);
    await db.delete(eventOptions);
    await db.delete(events);
  });

  it("戻り値に customQuestions 配列が含まれる", async () => {
    // Arrange
    const { id } = await createEventNew({
      title: "設問入りイベント",
      options: ["18:00"],
      customQuestions: ["持参するもの"],
    });

    // Act
    const data = await getEventWithOptions(id);

    // Assert
    expect(data).not.toBeNull();
    const customQuestions = (data as unknown as { customQuestions: unknown }).customQuestions;
    expect(Array.isArray(customQuestions)).toBe(true);
  });

  it("customQuestions は sort_order 昇順で並ぶ", async () => {
    // Arrange: createEvent の入力順とは異なる sort_order の並びを作るため、
    // 直接 event_custom_questions に sort_order を入れ替えて INSERT する
    const { id } = await createEventNew({
      title: "並び順検証イベント",
      options: ["18:00"],
      customQuestions: [],
    });
    await db.insert(eventCustomQuestions).values([
      { eventId: id, question: "三番目", sortOrder: 2 },
      { eventId: id, question: "一番目", sortOrder: 0 },
      { eventId: id, question: "二番目", sortOrder: 1 },
    ]);

    // Act
    const data = await getEventWithOptions(id);

    // Assert
    expect(data).not.toBeNull();
    const customQuestions = (
      data as unknown as {
        customQuestions: Array<{ question: string; sortOrder: number }>;
      }
    ).customQuestions;
    expect(customQuestions.map((q) => q.question)).toEqual(["一番目", "二番目", "三番目"]);
    expect(customQuestions.map((q) => q.sortOrder)).toEqual([0, 1, 2]);
  });

  it("設問 0 件のイベントでは customQuestions が空配列になる", async () => {
    // Arrange
    const { id } = await createEventNew({
      title: "設問なしイベント",
      options: ["18:00"],
      customQuestions: [],
    });

    // Act
    const data = await getEventWithOptions(id);

    // Assert
    expect(data).not.toBeNull();
    const customQuestions = (data as unknown as { customQuestions: unknown[] }).customQuestions;
    expect(customQuestions).toEqual([]);
  });

  it("各 response に customAnswers: Record<questionId, string> が含まれ、未回答の questionId は含まれない", async () => {
    // Arrange: 設問 3 件のイベント + 1 番目と 3 番目だけに回答した参加者
    const { id } = await createEventNew({
      title: "customAnswers 部分回答検証",
      options: ["18:00"],
      customQuestions: ["持参するもの", "アレルギー", "備考"],
    });
    const questions = await db
      .select()
      .from(eventCustomQuestions)
      .where(eq(eventCustomQuestions.eventId, id))
      .orderBy(asc(eventCustomQuestions.sortOrder));
    await addResponseNew(id, {
      name: "アリス",
      answers: {},
      customAnswers: {
        [String(questions[0]!.id)]: "ワイン",
        [String(questions[2]!.id)]: "特になし",
      },
      comment: null,
    });

    // Act
    const data = await getEventWithOptions(id);

    // Assert
    expect(data).not.toBeNull();
    const customAnswers = (
      data!.responses[0] as unknown as { customAnswers: Record<string, string> }
    ).customAnswers;
    expect(customAnswers).toEqual({
      [String(questions[0]!.id)]: "ワイン",
      [String(questions[2]!.id)]: "特になし",
    });
    // 未回答の設問 1 はキーに含まれない
    expect(Object.keys(customAnswers)).not.toContain(String(questions[1]!.id));
  });

  it("各 response に comment: string | null が含まれる（保存値をそのまま返す）", async () => {
    // Arrange: コメント有り / 無し の 2 件を投入
    const { id } = await createEventNew({
      title: "comment 検証",
      options: ["18:00"],
      customQuestions: [],
    });
    await addResponseNew(id, {
      name: "コメント有り",
      answers: {},
      customAnswers: {},
      comment: "よろしく",
    });
    await addResponseNew(id, {
      name: "コメント無し",
      answers: {},
      customAnswers: {},
      comment: null,
    });

    // Act
    const data = await getEventWithOptions(id);

    // Assert
    expect(data).not.toBeNull();
    const responses = data!.responses as unknown as Array<{
      name: string;
      comment: string | null;
    }>;
    const byName = new Map(responses.map((r) => [r.name, r.comment]));
    expect(byName.get("コメント有り")).toBe("よろしく");
    expect(byName.get("コメント無し")).toBe(null);
  });
});

// いいテストケース
describe("src/db.ts — 回答締め切り（deadline）", () => {
  beforeEach(async () => {
    // 子 → 親順に truncate（FK 制約を踏まないよう）
    await db.delete(participantCards);
    await db.delete(eventOptionResponses);
    await db.delete(eventCustomAnswers);
    await db.delete(eventResponses);
    await db.delete(eventCustomQuestions);
    await db.delete(eventOptions);
    await db.delete(events);
  });

  // 締め切りを指定して作成すると保存される
  describe("createEvent に deadline を渡すと events.deadline に保存される", () => {
    it("deadline に日時文字列（例: 2026-06-30T18:00）を渡すと events.deadline に同じ値が保存される", async () => {
      // Act
      const { id } = await createEvent({
        title: "締め切り付きイベント",
        options: ["18:00"],
        customQuestions: [],
        deadline: "2026-06-30T18:00",
      });

      // Assert
      const [row] = await db.select().from(events).where(eq(events.id, id));
      expect((row as unknown as { deadline: string | null }).deadline).toBe("2026-06-30T18:00");
    });
  });

  // 締め切りは任意項目（指定しなければ「締め切りなし」= null）
  describe("createEvent に deadline を指定しない場合は events.deadline は null として保存される", () => {
    it("deadline を未指定（undefined）にすると events.deadline は null として保存される", async () => {
      // Act
      const { id } = await createEvent({
        title: "締め切り未指定イベント",
        options: ["18:00"],
        customQuestions: [],
      });

      // Assert
      const [row] = await db.select().from(events).where(eq(events.id, id));
      expect((row as unknown as { deadline: string | null }).deadline).toBe(null);
    });
    it("deadline に null を渡すと events.deadline は null として保存される", async () => {
      // Act
      const { id } = await createEvent({
        title: "締め切り null イベント",
        options: ["18:00"],
        customQuestions: [],
        deadline: null,
      });

      // Assert
      const [row] = await db.select().from(events).where(eq(events.id, id));
      expect((row as unknown as { deadline: string | null }).deadline).toBe(null);
    });
  });

  // 読み出し側も deadline を返す
  describe("getEventWithOptions は保存した deadline をそのまま返す", () => {
    it("deadline 付きで作成したイベントを読み出すと event.deadline に保存値が含まれる", async () => {
      // Arrange
      const { id } = await createEvent({
        title: "締め切り付きイベント",
        options: ["18:00"],
        customQuestions: [],
        deadline: "2026-06-30T18:00",
      });

      // Act
      const data = await getEventWithOptions(id);

      // Assert
      expect(data).not.toBeNull();
      expect(data!.event.deadline).toBe("2026-06-30T18:00");
    });
    it("deadline なし（null）で作成したイベントを読み出すと event.deadline が null になる", async () => {
      // Arrange
      const { id } = await createEvent({
        title: "締め切りなしイベント",
        options: ["18:00"],
        customQuestions: [],
        deadline: null,
      });

      // Act
      const data = await getEventWithOptions(id);

      // Assert
      expect(data).not.toBeNull();
      expect(data!.event.deadline).toBe(null);
    });
  });
});
