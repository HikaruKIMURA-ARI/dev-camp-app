import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * Gemini Adapter (src/gemini.ts) の振る舞い検証。
 *
 * 設計参照:
 *   - .kiro/specs/tyousei-ph2/design.md `CardGenerator（src/gemini.ts）`
 *   - .kiro/specs/tyousei-ph2/requirements.md Requirement 4 / Requirement 7
 *   - .kiro/specs/tyousei-ph2/tasks.md Task 2.1
 *
 * モック方針:
 *   - 古典派 TDD の「プロセス外依存はモックする」に従い、`@google/genai` SDK
 *     を `mock.module` で差し替えて HTTP 経路を遮断する。
 *   - SDK 呼び出し回数は `generateContentCalls` でカウントし、
 *     「SDK を呼ばない」「1 回だけ呼ぶ」等の振る舞いを検証する。
 *   - module-local の `quotaExhausted` フラグはケース間で漏れないよう
 *     `beforeEach` で `__resetQuotaForTest()` を呼ぶ。
 */

// --- @google/genai SDK のモック配線 -----------------------------------------
// 各テストの beforeEach でリセットされる。
// generateContentImpl を差し替えることで、SDK 応答（成功 / エラー）をケース毎に
// 制御する。
let generateContentCalls = 0;
let generateContentImpl: (...args: unknown[]) => Promise<unknown> = async () => {
  throw new Error("generateContentImpl not configured");
};

mock.module("@google/genai", () => {
  return {
    GoogleGenAI: class FakeGoogleGenAI {
      models: {
        generateContent: (...args: unknown[]) => Promise<unknown>;
      };
      constructor(_opts: { apiKey?: string }) {
        this.models = {
          generateContent: async (...args: unknown[]) => {
            generateContentCalls += 1;
            return generateContentImpl(...args);
          },
        };
      }
    },
  };
});

// GEMINI_API_KEY をテスト中だけ設定する。これがないと Adapter は SDK を呼ばずに
// 即時 QuotaExhaustedError 相当を投げる「暗黙判定」経路に入り、本テストで検証
// したい「フラグ ON による短絡」と区別できなくなるため。
process.env.GEMINI_API_KEY = "test-api-key";

describe("gemini Adapter / defaultCardGenerator.generate", () => {
  describe("プロンプト構築（インジェクション対策 + 推奨候補）", () => {
    // Arrange（共有）: SDK モックを「呼ばれたら contents を含む引数全体を
    // キャプチャし、最後に有効な 7 属性 JSON を返す」状態に設定する。
    // contents が「文字列」「{ parts: [{ text }] } 配列」のいずれの形でも
    // text 部分を結合してプロンプト文字列として取り出せるよう、ヘルパで
    // 抽出する。
    let capturedArgs: unknown[] = [];

    beforeEach(async () => {
      const gemini = await import("./gemini");
      gemini.__resetQuotaForTest();
      gemini.setCardGeneratorForTest(null);
      generateContentCalls = 0;
      capturedArgs = [];
      generateContentImpl = async (...args: unknown[]) => {
        capturedArgs = args;
        return {
          text: '{"title":"テストの太郎","rarity":"N","attribute":"火","race":"戦士","flavor":"f","attack":1,"defense":1}',
        };
      };
    });

    // contents は SDK 仕様上 string か Content[] / Part[] を受け付ける。
    // 実装の選択に左右されない形でプロンプト本文を文字列として取り出す。
    function extractPromptText(args: unknown[]): string {
      const arg0 = args[0] as { contents?: unknown };
      const contents = arg0?.contents;
      if (typeof contents === "string") return contents;
      if (Array.isArray(contents)) {
        const parts: string[] = [];
        for (const item of contents) {
          if (typeof item === "string") {
            parts.push(item);
            continue;
          }
          if (item && typeof item === "object") {
            const itemObj = item as { text?: unknown; parts?: unknown };
            if (typeof itemObj.text === "string") {
              parts.push(itemObj.text);
            }
            if (Array.isArray(itemObj.parts)) {
              for (const p of itemObj.parts) {
                if (p && typeof p === "object") {
                  const pObj = p as { text?: unknown };
                  if (typeof pObj.text === "string") parts.push(pObj.text);
                }
              }
            }
          }
        }
        return parts.join("\n");
      }
      return "";
    }

    it("参加者名を <participant_name>...</participant_name> の構造境界で囲んでプロンプトを生成する（AC 4.5）", async () => {
      const { defaultCardGenerator } = await import("./gemini");

      // Act: 任意の参加者名で 1 回 generate を呼ぶ。
      await defaultCardGenerator.generate("太郎");

      // Assert: プロンプト本文に「<participant_name>太郎</participant_name>」が
      // そのまま含まれている。プロンプトインジェクション対策の構造境界が
      // 適用されているかを「最終的な結果としてのプロンプト文字列」で検証する。
      const promptText = extractPromptText(capturedArgs);
      expect(promptText).toContain("<participant_name>太郎</participant_name>");
    });

    it("プロンプト本文にレアリティ推奨候補（UR / SR / R / N）を列挙する（AC 7.3）", async () => {
      const { defaultCardGenerator } = await import("./gemini");

      // Act: 任意の参加者名で 1 回 generate を呼ぶ。
      await defaultCardGenerator.generate("太郎");

      // Assert: プロンプト本文に 4 つのレアリティ候補（UR / SR / R / N）が
      // すべて含まれている。具体的な並び方や区切り文字は実装の自由度に委ね、
      // 「候補として列挙されている」という最終結果のみを検証する。
      const promptText = extractPromptText(capturedArgs);
      expect(promptText).toContain("UR");
      expect(promptText).toContain("SR");
      expect(promptText).toContain("R");
      expect(promptText).toContain("N");
    });

    it("プロンプト本文に属性推奨候補（光 / 闇 / 水 / 風 / 地 / 火）を列挙する（AC 7.3）", async () => {
      const { defaultCardGenerator } = await import("./gemini");

      // Act: 任意の参加者名で 1 回 generate を呼ぶ。
      await defaultCardGenerator.generate("太郎");

      // Assert: プロンプト本文に 6 つの属性候補がすべて含まれている。
      // 並び順や区切り文字は実装の自由とし、各文字が含まれることのみを検証する。
      const promptText = extractPromptText(capturedArgs);
      expect(promptText).toContain("光");
      expect(promptText).toContain("闇");
      expect(promptText).toContain("水");
      expect(promptText).toContain("風");
      expect(promptText).toContain("地");
      expect(promptText).toContain("火");
    });

    it("プロンプト本文に種族推奨候補（戦士 / ドラゴン / 魔法使い 等）を列挙する（AC 7.3）", async () => {
      const { defaultCardGenerator } = await import("./gemini");

      // Act: 任意の参加者名で 1 回 generate を呼ぶ。
      await defaultCardGenerator.generate("太郎");

      // Assert: 種族候補は「等」の余地があるため、最低限「戦士 / ドラゴン /
      // 魔法使い」の 3 つが含まれることのみを必須として検証する。他候補の
      // 有無は実装の自由とし、ここでは縛らない。
      const promptText = extractPromptText(capturedArgs);
      expect(promptText).toContain("戦士");
      expect(promptText).toContain("ドラゴン");
      expect(promptText).toContain("魔法使い");
    });

    it("プロンプト本文に『推奨候補外の値を返してもよい』旨を明示し、自由文字列での返却を許容する（AC 7.3）", async () => {
      const { defaultCardGenerator } = await import("./gemini");

      // Act: 任意の参加者名で 1 回 generate を呼ぶ。
      await defaultCardGenerator.generate("太郎");

      // Assert: 「推奨候補外を許容する」旨が日本語で示されていればよく、
      // 具体的な言い回しは実装に委ねる。複数のキーワード候補のいずれかが
      // 含まれていれば pass とすることで、文言固定による偽陽性を避ける。
      const promptText = extractPromptText(capturedArgs);
      const allowanceKeywords = ["推奨外", "以外", "それ以外", "自由", "など"];
      const hasAllowance = allowanceKeywords.some((k) => promptText.includes(k));
      expect(hasAllowance).toBe(true);
    });

    it("プロンプト本文に JSON のみで応答するよう指示する（AC 7.1）", async () => {
      const { defaultCardGenerator } = await import("./gemini");

      // Act: 任意の参加者名で 1 回 generate を呼ぶ。
      await defaultCardGenerator.generate("太郎");

      // Assert: プロンプト本文に「JSON」の文字列が（大文字小文字いずれでも）
      // 含まれることのみを検証する。具体的な指示文の言い回しは実装の自由。
      const promptText = extractPromptText(capturedArgs);
      expect(promptText.toUpperCase()).toContain("JSON");
    });
  });

  describe("構造化出力モードでの SDK 呼び出し", () => {
    // Arrange（共有）: 各ケースで quotaExhausted フラグと SDK 呼び出しカウンタ、
    // テスト用差し替えをクリーンな状態にリセットする。SDK モックは「呼ばれたら
    // 引数を capturedArgs に格納し、最後に 7 属性を満たす成功 JSON を返す」状態に
    // 設定する。これにより Adapter は構造化応答の解析まで到達でき、テストでは
    // capturedArgs[0] に対する構造アサーションで SDK 呼び出し引数の振る舞いを
    // 検証できる。
    let capturedArgs: unknown[] = [];

    beforeEach(async () => {
      const gemini = await import("./gemini");
      gemini.__resetQuotaForTest();
      gemini.setCardGeneratorForTest(null);
      generateContentCalls = 0;
      capturedArgs = [];
      generateContentImpl = async (...args: unknown[]) => {
        capturedArgs = args;
        return {
          text: '{"title":"テストの太郎","rarity":"N","attribute":"火","race":"戦士","flavor":"f","attack":1,"defense":1}',
        };
      };
    });

    it("SDK 呼び出し時に responseMimeType を 'application/json' に指定する（AC 7.1）", async () => {
      const { defaultCardGenerator } = await import("./gemini");

      // Act: 1 回 generate を呼び、SDK 呼び出し引数をキャプチャする。
      await defaultCardGenerator.generate("太郎");

      // Assert: SDK の第 1 引数 config.responseMimeType が 'application/json'。
      // 構造化出力モードでの JSON 強制応答を担保する（AC 7.1）。
      const arg0 = capturedArgs[0] as { config?: { responseMimeType?: string } };
      expect(arg0?.config?.responseMimeType).toBe("application/json");
    });

    it("SDK 呼び出し時に responseSchema を渡し、7 属性をすべて required として宣言する（AC 7.1, 7.2）", async () => {
      const { defaultCardGenerator } = await import("./gemini");

      // Act: 1 回 generate を呼び、SDK 呼び出し引数をキャプチャする。
      await defaultCardGenerator.generate("太郎");

      // Assert: config.responseSchema が「7 属性すべてを required にしたオブジェクト
      // スキーマ」として渡されている。type 表現は Type.OBJECT（"OBJECT"）か
      // "object" のどちらか（SDK の Type enum 利用 / 文字列直書き両許容）で
      // 受け入れる。required は順序非依存で 7 属性を含むことだけを検証する。
      const arg0 = capturedArgs[0] as {
        config?: {
          responseSchema?: {
            type?: unknown;
            properties?: Record<string, unknown>;
            required?: unknown;
          };
        };
      };
      const schema = arg0?.config?.responseSchema;
      const expectedRequired = [
        "title",
        "rarity",
        "attribute",
        "race",
        "flavor",
        "attack",
        "defense",
      ];

      expect(schema).toBeDefined();
      if (schema === undefined) throw new Error("unreachable: schema is defined");

      // type は OBJECT を示す（"object" / "OBJECT" / Type.OBJECT のいずれか）。
      const typeStr = String(schema.type);
      expect(["object", "OBJECT"]).toContain(
        typeStr.toLowerCase() === "object" ? "object" : typeStr,
      );

      const properties = schema.properties;
      expect(properties).toBeDefined();
      for (const key of expectedRequired) {
        expect(properties).toHaveProperty(key);
      }

      const required = schema.required;
      expect(Array.isArray(required)).toBe(true);
      const requiredArr = required as unknown[];
      expect(requiredArr).toEqual(expect.arrayContaining(expectedRequired));
      expect(requiredArr.length).toBe(expectedRequired.length);
    });

    it("環境変数 GEMINI_MODEL が設定されていればその値を model として SDK に渡し、未設定時は既定 'gemini-2.0-flash' を渡す（AC 7.5）", async () => {
      const { defaultCardGenerator } = await import("./gemini");

      // Arrange 1: GEMINI_MODEL 未設定の状態を作る。try/finally で env を必ず復元。
      const prev = process.env.GEMINI_MODEL;
      delete process.env.GEMINI_MODEL;

      try {
        // Act 1: 未設定で 1 回 generate を呼ぶ。
        await defaultCardGenerator.generate("太郎");

        // Assert 1: 既定値 'gemini-2.0-flash' が渡される。
        const argDefault = capturedArgs[0] as { model?: string };
        expect(argDefault?.model).toBe("gemini-2.0-flash");

        // Arrange 2: GEMINI_MODEL を指定値に変更。
        process.env.GEMINI_MODEL = "gemini-2.5-flash-lite";
        capturedArgs = [];

        // Act 2: 指定値で再度 generate を呼ぶ。
        await defaultCardGenerator.generate("次郎");

        // Assert 2: GEMINI_MODEL の値が SDK に渡される。
        const argCustom = capturedArgs[0] as { model?: string };
        expect(argCustom?.model).toBe("gemini-2.5-flash-lite");
      } finally {
        if (prev === undefined) {
          delete process.env.GEMINI_MODEL;
        } else {
          process.env.GEMINI_MODEL = prev;
        }
      }
    });

    it("環境変数 GEMINI_TEMPERATURE / GEMINI_MAX_OUTPUT_TOKENS が設定されていればそれぞれ生成パラメータとして SDK に渡す（AC 7.5）", async () => {
      const { defaultCardGenerator } = await import("./gemini");

      // Arrange: 環境変数で温度・最大トークンを指定する。try/finally で復元。
      const prevTemp = process.env.GEMINI_TEMPERATURE;
      const prevMax = process.env.GEMINI_MAX_OUTPUT_TOKENS;
      process.env.GEMINI_TEMPERATURE = "0.5";
      process.env.GEMINI_MAX_OUTPUT_TOKENS = "128";

      try {
        // Act: generate を 1 回呼んで SDK 呼び出し引数をキャプチャする。
        await defaultCardGenerator.generate("太郎");

        // Assert: config.temperature / config.maxOutputTokens が数値として
        // 設定された値で渡されている（文字列のままではなく数値に変換）。
        const arg0 = capturedArgs[0] as {
          config?: { temperature?: number; maxOutputTokens?: number };
        };
        expect(arg0?.config?.temperature).toBe(0.5);
        expect(arg0?.config?.maxOutputTokens).toBe(128);
      } finally {
        if (prevTemp === undefined) {
          delete process.env.GEMINI_TEMPERATURE;
        } else {
          process.env.GEMINI_TEMPERATURE = prevTemp;
        }
        if (prevMax === undefined) {
          delete process.env.GEMINI_MAX_OUTPUT_TOKENS;
        } else {
          process.env.GEMINI_MAX_OUTPUT_TOKENS = prevMax;
        }
      }
    });
  });

  describe("エラー分類: クォータ枯渇（403）", () => {
    // Arrange: SDK モックの呼び出し回数とフラグをリセットし、SDK モックを
    // 「HTTP 403 を投げる」状態に設定する。これにより 1 回目の generate で
    // QuotaExhaustedError が発生し、内部の quotaExhausted フラグが立つ
    // 前提が整う。
    beforeEach(async () => {
      const gemini = await import("./gemini");
      gemini.__resetQuotaForTest();
      gemini.setCardGeneratorForTest(null);
      generateContentCalls = 0;
      generateContentImpl = async () => {
        // SDK の ApiError 相当。実装側は status === 403 で QuotaExhaustedError
        // に分類する。判定キーが status か message かは Phase 3 の実装詳細だが、
        // 両方を載せておくことで偽陽性を避ける。
        const err = Object.assign(new Error("Quota exceeded (403)"), {
          status: 403,
          code: 403,
        });
        throw err;
      };
    });

    it("SDK が HTTP 403 を返したとき、QuotaExhaustedError（kind: 'quota_exhausted'）を throw する（AC 4.3）", async () => {
      const { defaultCardGenerator, QuotaExhaustedError } = await import("./gemini");

      // Act: 403 を返す SDK に対して 1 回 generate を呼ぶ。
      let caught: unknown;
      try {
        await defaultCardGenerator.generate("alice");
      } catch (e) {
        caught = e;
      }

      // Assert: 例外型と kind、SDK が 1 回だけ呼ばれたことを検証する。
      expect(caught).toBeInstanceOf(QuotaExhaustedError);
      expect((caught as { kind?: string }).kind).toBe("quota_exhausted");
      expect(generateContentCalls).toBe(1);
    });

    it("HTTP 403 を一度観測したあと、module-local の quotaExhausted フラグが立つ（AC 4.3, 4.8）", async () => {
      const { defaultCardGenerator, QuotaExhaustedError } = await import("./gemini");

      // Act 1: 1 回目の generate で 403 を観測してフラグを立てる。
      try {
        await defaultCardGenerator.generate("alice");
      } catch {
        // フラグを立てるための前段。
      }

      // Arrange 追加: 2 回目に SDK が呼ばれてしまった場合に区別できるよう、
      // 「呼ばれたら成功 JSON を返す」実装に差し替える。フラグが立っていれば
      // この差し替えは無視されるはず。
      generateContentImpl = async () => ({
        text: '{"title":"テスト","rarity":"N","attribute":"火","race":"戦士","flavor":"f","attack":1,"defense":1}',
      });

      // Act 2: フラグが立った状態で 2 回目を呼ぶ。
      let caught: unknown;
      try {
        await defaultCardGenerator.generate("bob");
      } catch (e) {
        caught = e;
      }

      // Assert: フラグの効果として、2 回目も QuotaExhaustedError が投げられ、
      // SDK は 1 回目以降呼ばれていない（フラグ ON 状態の代理検証）。
      expect(caught).toBeInstanceOf(QuotaExhaustedError);
      expect(generateContentCalls).toBe(1);
    });

    it("クォータ枯渇フラグが立った状態で再度 generate を呼ぶと、SDK を一切呼ばずに QuotaExhaustedError が投げられること（AC 4.8）", async () => {
      const { defaultCardGenerator, QuotaExhaustedError } = await import("./gemini");

      // Act 1: 1 回目の generate で 403 を観測させ、quotaExhausted フラグを立てる。
      try {
        await defaultCardGenerator.generate("alice");
      } catch {
        // 1 回目は QuotaExhaustedError が投げられる前提（フラグを立てるための前段）。
      }
      const callsAfterFirst = generateContentCalls;

      // Act 2: フラグが立った状態で 2 回目を呼ぶ。
      let caught: unknown;
      try {
        await defaultCardGenerator.generate("bob");
      } catch (e) {
        caught = e;
      }

      // Assert: 2 回目も QuotaExhaustedError、かつ SDK 呼び出しは増えない。
      expect(caught).toBeInstanceOf(QuotaExhaustedError);
      expect(callsAfterFirst).toBe(1);
      expect(generateContentCalls).toBe(1);
    });

    it("__resetQuotaForTest() を呼ぶと quotaExhausted フラグが解除され、次回 generate で再び SDK を呼ぶ", async () => {
      const gemini = await import("./gemini");
      const { defaultCardGenerator } = gemini;

      // Act 1: 1 回目の generate で 403 を観測してフラグを ON にする。
      try {
        await defaultCardGenerator.generate("alice");
      } catch {
        // フラグを立てるための前段。
      }

      // Arrange 追加: フラグ解除 + 2 回目は成功させる SDK 応答に差し替える。
      gemini.__resetQuotaForTest();
      generateContentImpl = async () => ({
        text: '{"title":"テスト","rarity":"N","attribute":"火","race":"戦士","flavor":"f","attack":1,"defense":1}',
      });

      // Act 2: フラグ解除後の 2 回目 generate。
      const result = await defaultCardGenerator.generate("bob");

      // Assert: throw せず RawCardAttributes 形状で解決され、SDK は 2 回目も呼ばれている。
      expect(generateContentCalls).toBe(2);
      expect(result).toEqual({
        title: "テスト",
        rarity: "N",
        attribute: "火",
        race: "戦士",
        flavor: "f",
        attack: 1,
        defense: 1,
      });
    });
  });

  describe("エラー分類: 一過性エラー（TransientError）", () => {
    // Arrange（共有）: 各ケースで quotaExhausted フラグと SDK 呼び出しカウンタ、
    // テスト用差し替えをクリーンな状態にリセットする。
    // SDK 応答（kind 分類のトリガとなる例外 / 応答）は各 it 内で
    // generateContentImpl を差し替えてケース固有に設定する
    // （Arrange は本来 it の外が原則だが、6 ケースが完全に異なる SDK 応答を
    //   必要とするため、コメント付きで it 冒頭に書く現実解を採用）。
    beforeEach(async () => {
      const gemini = await import("./gemini");
      gemini.__resetQuotaForTest();
      gemini.setCardGeneratorForTest(null);
      generateContentCalls = 0;
    });

    it("SDK が HTTP 429 を返したとき、TransientError（kind: 'rate_limited'）を throw し、quotaExhausted フラグは立てない（AC 4.3）", async () => {
      const { defaultCardGenerator, TransientError, QuotaExhaustedError } =
        await import("./gemini");

      // Arrange: SDK モックを「HTTP 429 を投げる」状態に設定する。
      generateContentImpl = async () => {
        const err = Object.assign(new Error("Too Many Requests (429)"), {
          status: 429,
          code: 429,
        });
        throw err;
      };

      // Act 1: 429 を返す SDK に対して 1 回 generate を呼ぶ。
      let caught: unknown;
      try {
        await defaultCardGenerator.generate("alice");
      } catch (e) {
        caught = e;
      }

      // Assert: TransientError(kind: 'rate_limited') が投げられる。
      expect(caught).toBeInstanceOf(TransientError);
      expect((caught as { kind?: string }).kind).toBe("rate_limited");

      // Arrange 追加: 2 回目に「フラグが立っているかどうか」を検証するため、
      // SDK 応答を成功 JSON に差し替える。フラグが立っていなければ SDK は
      // 再度呼ばれ、成功結果が返るはず。
      generateContentImpl = async () => ({
        text: '{"title":"テスト","rarity":"N","attribute":"火","race":"戦士","flavor":"f","attack":1,"defense":1}',
      });

      // Act 2: フラグが立っていないことの代理検証。
      const result = await defaultCardGenerator.generate("bob");

      // Assert: 2 回目は QuotaExhaustedError ではなく成功し、SDK が再度呼ばれた。
      expect(result).not.toBeInstanceOf(QuotaExhaustedError);
      expect(generateContentCalls).toBe(2);
    });

    it("SDK が HTTP 500 / 502 / 503 を返したとき、TransientError（kind: 'server_5xx'）を throw する", async () => {
      const { defaultCardGenerator, TransientError } = await import("./gemini");

      // Arrange: 5xx 系の代表として 503 を投げる SDK モックを設定する。
      // 500 / 502 / 503 をそれぞれ別ケースに分けるとケース数が爆発するため、
      // 「5xx は server_5xx に分類される」という分類規則を 1 ケースで検証する。
      generateContentImpl = async () => {
        const err = Object.assign(new Error("Service Unavailable (503)"), {
          status: 503,
          code: 503,
        });
        throw err;
      };

      // Act: generate を 1 回呼ぶ。
      let caught: unknown;
      try {
        await defaultCardGenerator.generate("alice");
      } catch (e) {
        caught = e;
      }

      // Assert: TransientError(kind: 'server_5xx')。
      expect(caught).toBeInstanceOf(TransientError);
      expect((caught as { kind?: string }).kind).toBe("server_5xx");
      expect(generateContentCalls).toBe(1);
    });

    it("SDK 呼び出しが GEMINI_TIMEOUT_MS 以内に解決しなかったとき、TransientError（kind: 'timeout'）を throw する", async () => {
      // Arrange: タイムアウトを 50ms に短縮し、SDK は永遠に resolve しない
      // Promise を返す状態に設定する。Adapter 側の Promise.race による
      // タイムアウト判定が発火することを期待する。
      const prevTimeout = process.env.GEMINI_TIMEOUT_MS;
      process.env.GEMINI_TIMEOUT_MS = "50";
      generateContentImpl = () =>
        new Promise(() => {
          // 永遠に resolve / reject しない（Adapter のタイムアウトに任せる）。
        });

      try {
        const { defaultCardGenerator, TransientError } = await import("./gemini");

        // Act: generate を呼び、Adapter のタイムアウトを発火させる。
        let caught: unknown;
        try {
          await defaultCardGenerator.generate("alice");
        } catch (e) {
          caught = e;
        }

        // Assert: TransientError(kind: 'timeout')。
        expect(caught).toBeInstanceOf(TransientError);
        expect((caught as { kind?: string }).kind).toBe("timeout");
      } finally {
        // 後始末: 環境変数を元に戻す（他テストへ漏らさない）。
        if (prevTimeout === undefined) {
          delete process.env.GEMINI_TIMEOUT_MS;
        } else {
          process.env.GEMINI_TIMEOUT_MS = prevTimeout;
        }
      }
    });

    it("SDK 呼び出し中にネットワーク例外（fetch reject）が発生したとき、TransientError（kind: 'network'）を throw する", async () => {
      const { defaultCardGenerator, TransientError } = await import("./gemini");

      // Arrange: status を持たないネットワーク系の例外を投げる SDK モック。
      // Adapter は「status を持たない例外」を network に分類する想定。
      generateContentImpl = async () => {
        throw new TypeError("fetch failed");
      };

      // Act: generate を 1 回呼ぶ。
      let caught: unknown;
      try {
        await defaultCardGenerator.generate("alice");
      } catch (e) {
        caught = e;
      }

      // Assert: TransientError(kind: 'network')。
      expect(caught).toBeInstanceOf(TransientError);
      expect((caught as { kind?: string }).kind).toBe("network");
      expect(generateContentCalls).toBe(1);
    });

    it("SDK 応答の text が JSON.parse 不可能な文字列のとき、TransientError（kind: 'json_invalid'）を throw する", async () => {
      const { defaultCardGenerator, TransientError } = await import("./gemini");

      // Arrange: SDK が「JSON として parse できない文字列」を返す状態に設定。
      generateContentImpl = async () => ({
        text: "not a json string {{{",
      });

      // Act: generate を 1 回呼ぶ。
      let caught: unknown;
      try {
        await defaultCardGenerator.generate("alice");
      } catch (e) {
        caught = e;
      }

      // Assert: TransientError(kind: 'json_invalid')。
      expect(caught).toBeInstanceOf(TransientError);
      expect((caught as { kind?: string }).kind).toBe("json_invalid");
      expect(generateContentCalls).toBe(1);
    });

    it("SDK 応答の JSON に 7 属性のいずれかが欠落していたとき、TransientError（kind: 'schema_invalid'）を throw する（AC 7.2）", async () => {
      const { defaultCardGenerator, TransientError } = await import("./gemini");

      // Arrange: 7 属性のうち defense を意図的に欠落させた JSON を返す状態に設定。
      // 「いずれかの欠落」を 1 ケースで代表検証する。
      generateContentImpl = async () => ({
        text: '{"title":"テスト","rarity":"N","attribute":"火","race":"戦士","flavor":"f","attack":1}',
      });

      // Act: generate を 1 回呼ぶ。
      let caught: unknown;
      try {
        await defaultCardGenerator.generate("alice");
      } catch (e) {
        caught = e;
      }

      // Assert: TransientError(kind: 'schema_invalid')。
      expect(caught).toBeInstanceOf(TransientError);
      expect((caught as { kind?: string }).kind).toBe("schema_invalid");
      expect(generateContentCalls).toBe(1);
    });
  });

  describe("API キー未設定時の挙動", () => {
    it("GEMINI_API_KEY が未設定の状態で generate を呼ぶと、SDK を呼ばずに QuotaExhaustedError を投げて Tier 3 経路に落とす（design.md §4 暗黙の判定）", async () => {
      // Arrange
      const { defaultCardGenerator, QuotaExhaustedError, __resetQuotaForTest } =
        await import("./gemini");
      __resetQuotaForTest();
      generateContentCalls = 0;

      const prev = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      try {
        // Act
        let caught: unknown;
        try {
          await defaultCardGenerator.generate("alice");
        } catch (e) {
          caught = e;
        }

        // Assert
        expect(caught).toBeInstanceOf(QuotaExhaustedError);
        expect(generateContentCalls).toBe(0);
      } finally {
        if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
      }
    });
  });
});

describe("gemini Adapter / defaultCardGenerator.verifyConnectivity", () => {
  it("GEMINI_API_KEY が未設定のとき verifyConnectivity は { ok: false, reason: 'missing_api_key' } を返す（throw しない）", async () => {
    // Arrange
    const { defaultCardGenerator } = await import("./gemini");
    const prev = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      // Act
      const result = await defaultCardGenerator.verifyConnectivity();

      // Assert
      expect(result).toEqual({ ok: false, reason: "missing_api_key" });
    } finally {
      if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
    }
  });

  it("SDK が正常応答を返したとき verifyConnectivity は { ok: true } を返す", async () => {
    // Arrange
    const { defaultCardGenerator, __resetQuotaForTest } = await import("./gemini");
    __resetQuotaForTest();
    generateContentImpl = async () => ({
      text: '{"title":"x","rarity":"N","attribute":"火","race":"戦士","flavor":"f","attack":1,"defense":1}',
    });

    // Act
    const result = await defaultCardGenerator.verifyConnectivity();

    // Assert
    expect(result).toEqual({ ok: true });
  });

  it("SDK がネットワーク例外を投げたとき verifyConnectivity は { ok: false, reason: 'network' } を返す（throw しない）", async () => {
    // Arrange
    const { defaultCardGenerator, __resetQuotaForTest } = await import("./gemini");
    __resetQuotaForTest();
    generateContentImpl = async () => {
      throw new TypeError("fetch failed");
    };

    // Act
    const result = await defaultCardGenerator.verifyConnectivity();

    // Assert
    expect(result).toEqual({ ok: false, reason: "network" });
  });
});
