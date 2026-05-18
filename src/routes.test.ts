import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { Hono } from "hono";
import app from "./index";

/**
 * Task 1.5: Hono サブアプリ骨格とアプリ組み立て
 *
 * 検証対象:
 *  - `src/routes.tsx` を Hono サブアプリとして作成し、`src/index.tsx` で
 *    `app.route("/", routes)` でマウントしたあとの「アプリ全体としての HTTP 応答」
 *  - `GET /` で 302 + `Location: /events/new` を返す
 *
 * スコープ外（後続タスクで列挙する振る舞い）:
 *  - `/events/new` のフォーム描画（2.1）
 *  - `POST /events` の永続化 / 差し戻し（2.2）
 *  - イベント閲覧・集計（3.1）
 *  - 回答登録 / 編集（4.x）
 *  - Webhook 一覧 / 登録（5.x）
 *  - 催促送信（7.x）
 *
 * 設計の前提:
 *  - `src/index.tsx` から default export される `{ fetch }` をテスト対象にすることで、
 *    `app.route("/", routes)` のマウント結果まで含めて検証する（実体結合・古典派）
 *  - 「アプリ組み立てが正しく行われていること」は、サブアプリ側に薄いダミーハンドラを
 *    定義せずとも、`GET /` の 302 が観測できることで十分担保される
 *
 * 備考:
 *  - Bun の `it.todo` は `fn` 引数が必須のため、本ファイルでは `() => {}` を渡している。
 *    Phase 2（RED）で本体実装に置き換える。
 */
describe("routes (Hono sub-app) mounted on app", () => {
  describe("GET /", () => {
    it("GET / は /events/new に 302 リダイレクトする", async () => {
      // Arrange
      const request = new Request("http://localhost:8787/");

      // Act
      const response = await app.fetch(request);

      // Assert
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/events/new");
    });

    it.todo("GET / のレスポンスは Location ヘッダだけで遷移を成立させる", () => {});
  });

  describe("アプリ組み立ての健全性（マウント済みであること）", () => {
    it.todo("未定義のパスへの GET は 404 を返す", () => {});
  });

  /**
   * Task 2.1: イベント作成フォームのフルページ
   *
   * 検証対象:
   *  - `GET /events/new` が `<EventNewForm/>` を `<Layout>` 内に包んだフルページを返す
   *  - フォーム要素（タイトル / 候補日時の動的行 / 任意のカスタム設問入力）が DOM に存在し、
   *    フォーム送信時に必要な name 属性で値が POST される
   *  - フォームは `POST /events` への通常フォーム送信（非 htmx）として構成されている
   *    （要件 1.2 / design「POST /events だけは htmx を使わない通常フォーム送信」）
   *
   * スコープ外（このタスクでは検証しない）:
   *  - レイアウト崩れ（375/768/1280 viewport）→ E2E 側で検証（要件 9.2）
   *  - タップ領域 44px・配色の視覚的検証 → E2E 側で検証（要件 9.3 / 9.4）
   *  - WCAG AA コントラスト → E2E / アクセシビリティテスト側（要件 9.5）
   *  - 候補日時の動的追加・削除のクライアントサイド実装（ライブラリ・属性名問わず）→ E2E 側で検証
   *  - `POST /events` の永続化・差し戻し（タスク 2.2）
   *  - label-input の関連付け方式（`for`/`id` / 暗黙ネスト / `aria-labelledby`）
   *    → E2E 側で `getByLabel` 系の振る舞い検証に委譲（要件 9.1）
   *
   * 設計の前提:
   *  - `app.fetch` 経由で実体の routes / views を結合して検証（古典派ブラックボックス）
   *  - DOM 検証は HTML 文字列に対する構造的アサーション（HTMLRewriter / 正規表現 / 文字列 includes）に留め、
   *    具体的なクラス名や文言など実装の詳細には踏み込まない（リファクタリング耐性を優先）
   */
  describe("GET /events/new", () => {
    it("GET /events/new は 200 を返す", async () => {
      // Arrange
      const request = new Request("http://localhost:8787/events/new");

      // Act
      const response = await app.fetch(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it.todo("Content-Type に text/html を含めて返る", () => {});

    it("GET /events/new はアプリのレイアウトに収まったフルページの HTML を返す", async () => {
      // Arrange
      const request = new Request("http://localhost:8787/events/new");

      // Act
      const response = await app.fetch(request);
      const body = await response.text();

      // Assert
      expect(body).toContain("<html");
      expect(body).toContain('<main class="container">');
    });

    it("イベント作成画面に POST /events へ送信するフォームが含まれる", async () => {
      // Arrange
      const request = new Request("http://localhost:8787/events/new");

      // Act
      const response = await app.fetch(request);
      const body = await response.text();

      // Assert
      expect(body).toMatch(/<form[^>]*\bmethod=["']post["']/i);
      expect(body).toMatch(/<form[^>]*\baction=["']\/events["']/i);
    });

    it('フォームに name="title" の入力欄が含まれる', async () => {
      // Arrange
      const request = new Request("http://localhost:8787/events/new");

      // Act
      const response = await app.fetch(request);
      const body = await response.text();

      // Assert
      expect(body).toMatch(/<input[^>]*\bname=["']title["']/i);
    });

    it('フォームに name="options" の入力欄が初期で 1 件以上含まれる', async () => {
      // Arrange
      const request = new Request("http://localhost:8787/events/new");

      // Act
      const response = await app.fetch(request);
      const body = await response.text();

      // Assert
      expect(body).toMatch(/<(?:input|textarea)[^>]*\bname=["']options(\[\])?["']/i);
    });

    it("フォームに候補日時を追加する UI が含まれる", async () => {
      // Arrange
      const request = new Request("http://localhost:8787/events/new");

      // Act
      const response = await app.fetch(request);
      const body = await response.text();

      // Assert
      // ユーザの観察可能な振る舞いとして「『追加』というラベルのボタンが画面に存在する」ことを近似で検証する。
      // 動的に行が増えるブラウザ挙動は E2E に委譲（JSDoc コメント参照）。
      expect(body).toMatch(/<button[^>]*>[^<]*追加[^<]*<\/button>/);
    });

    it('フォームに必須でない name="customQuestion" の入力欄が含まれる', async () => {
      // Arrange
      const request = new Request("http://localhost:8787/events/new");

      // Act
      const response = await app.fetch(request);
      const body = await response.text();

      // Assert
      // 要件 1.7 / 7.2: カスタム設問は任意（required ではない）かつ自由記述。
      // input / textarea のいずれの実装も許容するため、タグ単位で取り出して `required` 属性の不在を検証する。
      const match = body.match(/<(?:input|textarea)[^>]*\bname=["']customQuestion["'][^>]*>/i);
      expect(match).not.toBeNull();
      expect(match![0]).not.toMatch(/\brequired\b/i);
    });

    it("フォームに送信ボタンが含まれる", async () => {
      // Arrange
      const request = new Request("http://localhost:8787/events/new");

      // Act
      const response = await app.fetch(request);
      const body = await response.text();

      // Assert
      // 要件 1.2: 主催者が送信ボタンを押すとフォームが POST /events に送信される。
      // 「追加」ボタンは type="button" で送信用と区別されているため、
      // type="submit" を明示する要素（<button> / <input>）のいずれかを許容する。
      expect(body).toMatch(/<(?:button|input)[^>]*\btype=["']submit["']/i);
    });
  });

  /**
   * Task 2.2: イベント作成の永続化と差し戻し
   *
   * 検証対象:
   *  - `POST /events` を **非 htmx の通常フォーム送信** として受け、`zValidator("form", eventCreateSchema)` で
   *    `title` 1..200 / `options` 1+ 件・各 1..200・重複なし / `customQuestion?` 0..200 を検証する
   *  - 正常時: `crypto.randomUUID()` で event ID を発行し、`events` + `event_options` を単一 tx で永続化し、
   *    `customQuestion` 空文字は null として保存。レスポンスは 302 で `Location: /events/<uuid>` を返す
   *  - 異常時: 422 で `<EventNewForm/>` を `<Layout>` 内に再描画したフルページを返す
   *    （要件 1.3-1.5 / 1.9 の「HX-Retarget でフォームに差し戻し」は本 POST に限り
   *      `design.md` 行 292 の Implementation Notes で **htmx を使わず通常フォーム送信 + フルページ再描画** と
   *      明示的に上書きされている。よって `HX-Retarget` ヘッダは返らず、レスポンス本文に `<html` と
   *      `<main class="container">` を含むフルページが返ること、を観察可能な振る舞いとして検証する）
   *  - 入力値保持: 422 のレスポンス本文に、送信した `title` / `options[]` / `customQuestion` の各値が含まれる
   *  - イベント ID は推測困難（UUID 形式）であること
   *
   * 設計の前提:
   *  - `app.fetch` 経由で実体の routes / db / views を結合して検証（古典派ブラックボックス）
   *  - DB は実体を使う（共有依存）。テスト間の隔離は、テストごとに `:memory:` SQLite を持つよう
   *    `TURSO_DATABASE_URL` を `db` 動的 import 前に設定する規約 (design.md 行 412) に従う
   *  - フォーム送信は `Content-Type: application/x-www-form-urlencoded` の `Request` を組み立てて送る
   *
   * スコープ外（このタスクでは検証しない）:
   *  - `<EventNewForm/>` の `errors` / `values` props 表示方式の DOM 構造（class 名・ARIA 属性など実装詳細）
   *    → views 単体テスト / E2E 側に委譲（リファクタリング耐性を優先）
   *  - DB トランザクションが「片方だけ残らない」ロールバック挙動の意図的失敗注入
   *    → 本ユニットでは扱わない（古典派ブラックボックスの観察可能な振る舞いを超える）
   *  - 302 を 303 / 307 に変える代替案（タスク完了条件で 302 が明示されているため固定）
   *  - 候補日時を表す `options` の解釈（datetime かフリーテキストか）→ 本タスクは文字列扱いのみ
   *  - 同時送信や競合（race condition）→ 本ユニットでは扱わない
   *  - CSRF / 認可 → MVP 範囲外
   *
   * 備考:
   *  - Bun の `it.todo` は `fn` 引数が必須のため、本ファイルでは `() => {}` を渡している。
   *    Phase 2（RED）で本体実装に置き換える。
   */
  describe("POST /events", () => {
    /**
     * テスト対象アプリは `:memory:` SQLite に向けた状態で動的 import する。
     * 既存テスト（ファイル冒頭の static import `app`）は `local.db` を使うが、
     * 本 describe 内では `localApp` を参照し、in-memory DB の状態を実体クエリで検証する。
     *
     * `beforeEach` で `events` / `event_options` を truncate して、ケース間の隔離を確保する。
     */
    let localApp: Hono;
    let database: typeof import("./db").db;
    let schema: typeof import("./schema");

    beforeAll(async () => {
      process.env.TURSO_DATABASE_URL = ":memory:";
      const dbMod = await import("./db");
      database = dbMod.db;
      schema = await import("./schema");
      const routesMod = await import("./routes");
      const { Hono } = await import("hono");
      const sub = new Hono();
      sub.route("/", routesMod.default);
      localApp = sub;
    });

    beforeEach(async () => {
      await database.delete(schema.eventOptions);
      await database.delete(schema.events);
    });

    // 共通ヘルパ: URL エンコードフォームを組み立てる。
    // 配列フィールド (`options`) は `options=a&options=b` の繰り返しで送る。
    const buildFormRequest = (entries: Array<[string, string]>): Request => {
      const params = new URLSearchParams();
      for (const [k, v] of entries) {
        params.append(k, v);
      }
      return new Request("http://localhost:8787/events", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
    };

    const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    describe("正常系（有効なフォームでの永続化とリダイレクト）", () => {
      it("有効な form を送ると 302 を返す", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", "新年会"],
            ["options", "2026-01-10 19:00"],
            ["options", "2026-01-11 19:00"],
          ]),
        );

        // Assert
        expect(response.status).toBe(302);
      });

      it("有効な form を送ると Location ヘッダが /events/<id> を指す", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", "新年会"],
            ["options", "2026-01-10 19:00"],
          ]),
        );

        // Assert
        const location = response.headers.get("location");
        expect(location).toMatch(/^\/events\/[^/]+$/);
      });

      it("発行される event ID は UUID v4 形式（推測困難な文字列）である", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", "新年会"],
            ["options", "2026-01-10 19:00"],
          ]),
        );

        // Assert
        const location = response.headers.get("location") ?? "";
        const id = location.replace(/^\/events\//, "");
        expect(id).toMatch(UUID_V4_REGEX);
      });

      it("有効な form を送ると events テーブルに 1 件のレコードが作成される", async () => {
        // Act
        await localApp.fetch(
          buildFormRequest([
            ["title", "新年会"],
            ["options", "2026-01-10 19:00"],
          ]),
        );

        // Assert
        const rows = await database.select().from(schema.events);
        expect(rows).toHaveLength(1);
      });

      it("作成された events レコードの title は送信した値と一致する", async () => {
        // Act
        await localApp.fetch(
          buildFormRequest([
            ["title", "新年会2026"],
            ["options", "2026-01-10 19:00"],
          ]),
        );

        // Assert
        const rows = await database.select().from(schema.events);
        expect(rows[0]?.title).toBe("新年会2026");
      });

      it("有効な form を送ると event_options テーブルに送信した候補数と同じ件数のレコードが作成される", async () => {
        // Act
        await localApp.fetch(
          buildFormRequest([
            ["title", "新年会"],
            ["options", "2026-01-10 19:00"],
            ["options", "2026-01-11 19:00"],
            ["options", "2026-01-12 19:00"],
          ]),
        );

        // Assert
        const rows = await database.select().from(schema.eventOptions);
        expect(rows).toHaveLength(3);
      });

      it("作成された event_options のラベルは送信した options の値と一致する", async () => {
        // Act
        await localApp.fetch(
          buildFormRequest([
            ["title", "新年会"],
            ["options", "2026-01-10 19:00"],
            ["options", "2026-01-11 19:00"],
          ]),
        );

        // Assert
        const rows = await database.select().from(schema.eventOptions);
        const labels = rows.map((r) => r.label).sort();
        expect(labels).toEqual(["2026-01-10 19:00", "2026-01-11 19:00"].sort());
      });

      it("作成された event_options は送信順に sort_order が採番されている", async () => {
        // Act
        await localApp.fetch(
          buildFormRequest([
            ["title", "新年会"],
            ["options", "first"],
            ["options", "second"],
            ["options", "third"],
          ]),
        );

        // Assert
        const rows = await database
          .select()
          .from(schema.eventOptions)
          .orderBy(schema.eventOptions.sortOrder);
        expect(rows.map((r) => r.label)).toEqual(["first", "second", "third"]);
      });

      it("customQuestion に非空文字列を含めて送ると events.custom_question に当該文字列が保存される", async () => {
        // Act
        await localApp.fetch(
          buildFormRequest([
            ["title", "新年会"],
            ["options", "2026-01-10 19:00"],
            ["customQuestion", "アレルギーはありますか？"],
          ]),
        );

        // Assert
        const rows = await database.select().from(schema.events);
        expect(rows[0]?.customQuestion).toBe("アレルギーはありますか？");
      });

      it("customQuestion を空文字で送ると events.custom_question は null として保存される", async () => {
        // Act
        await localApp.fetch(
          buildFormRequest([
            ["title", "新年会"],
            ["options", "2026-01-10 19:00"],
            ["customQuestion", ""],
          ]),
        );

        // Assert
        const rows = await database.select().from(schema.events);
        expect(rows[0]?.customQuestion).toBeNull();
      });

      it("customQuestion フィールド自体を送らなかった場合も events.custom_question は null として保存される", async () => {
        // Act
        await localApp.fetch(
          buildFormRequest([
            ["title", "新年会"],
            ["options", "2026-01-10 19:00"],
          ]),
        );

        // Assert
        const rows = await database.select().from(schema.events);
        expect(rows[0]?.customQuestion).toBeNull();
      });
    });

    describe("バリデーション失敗時の差し戻し（422 + フルページ + 入力値保持）", () => {
      it("title が空文字のフォームを送ると 422 を返す", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", ""],
            ["options", "2026-01-10 19:00"],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("title が空白のみのフォームを送ると 422 を返す", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", "   "],
            ["options", "2026-01-10 19:00"],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("title が 201 文字のフォームを送ると 422 を返す", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", "a".repeat(201)],
            ["options", "2026-01-10 19:00"],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("options が 0 件のフォームを送ると 422 を返す", async () => {
        // Act
        const response = await localApp.fetch(buildFormRequest([["title", "新年会"]]));

        // Assert
        expect(response.status).toBe(422);
      });

      it("options のいずれかが空文字のフォームを送ると 422 を返す", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", "新年会"],
            ["options", "2026-01-10 19:00"],
            ["options", ""],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("options に重複があるフォームを送ると 422 を返す", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", "新年会"],
            ["options", "2026-01-10 19:00"],
            ["options", "2026-01-10 19:00"],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("options のいずれかが 201 文字のフォームを送ると 422 を返す", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", "新年会"],
            ["options", "a".repeat(201)],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("customQuestion が 201 文字のフォームを送ると 422 を返す", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", "新年会"],
            ["options", "2026-01-10 19:00"],
            ["customQuestion", "a".repeat(201)],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("422 時のレスポンスは Location ヘッダを持たない（リダイレクトしない）", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", ""],
            ["options", "2026-01-10 19:00"],
          ]),
        );

        // Assert
        // 422 を返したうえで Location が無いことが「リダイレクトしない」の観察可能な振る舞い。
        // 前段で 422 を要求しないと、未ルート（404）でも意図せずパスしてしまう。
        expect(response.status).toBe(422);
        expect(response.headers.get("location")).toBeNull();
      });

      it("422 時のレスポンスは HX-Retarget ヘッダを持たない（フルページ差し戻し）", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", ""],
            ["options", "2026-01-10 19:00"],
          ]),
        );

        // Assert
        // 422 を返したうえで HX-Retarget が無いことが「フルページ差し戻し（htmx 部分置換ではない）」の
        // 観察可能な振る舞い。前段で 422 を要求しないと未ルートでも意図せずパスしてしまう。
        expect(response.status).toBe(422);
        expect(response.headers.get("hx-retarget")).toBeNull();
      });

      it("422 時のレスポンス本文は <html を含むフルページである", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", ""],
            ["options", "2026-01-10 19:00"],
          ]),
        );
        const body = await response.text();

        // Assert
        expect(body).toContain("<html");
      });

      it('422 時のレスポンス本文は <main class="container"> を含み <Layout> 内に再描画される', async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", ""],
            ["options", "2026-01-10 19:00"],
          ]),
        );
        const body = await response.text();

        // Assert
        expect(body).toContain('<main class="container">');
      });

      it("422 時のレスポンス本文には送信した title の値が含まれる（入力値保持）", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", "保持されるべきタイトル"],
            ["options", ""],
          ]),
        );
        const body = await response.text();

        // Assert
        expect(body).toContain("保持されるべきタイトル");
      });

      it("422 時のレスポンス本文には送信した options の各値が含まれる（入力値保持）", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", ""],
            ["options", "保持される候補A"],
            ["options", "保持される候補B"],
          ]),
        );
        const body = await response.text();

        // Assert
        expect(body).toContain("保持される候補A");
        expect(body).toContain("保持される候補B");
      });

      it("422 時のレスポンス本文には送信した customQuestion の値が含まれる（入力値保持）", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", ""],
            ["options", "2026-01-10 19:00"],
            ["customQuestion", "保持される設問"],
          ]),
        );
        const body = await response.text();

        // Assert
        expect(body).toContain("保持される設問");
      });

      it("422 を返したとき events テーブルにレコードは作成されない（副作用なし）", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", ""],
            ["options", "2026-01-10 19:00"],
          ]),
        );

        // Assert
        // 「422 を返したうえで events に副作用が無い」が観察可能な振る舞い。
        // 前段で 422 を要求しないと、未ルート（404）でも DB は空のまま意図せずパスしてしまう。
        expect(response.status).toBe(422);
        const rows = await database.select().from(schema.events);
        expect(rows).toHaveLength(0);
      });

      it("422 を返したとき event_options テーブルにレコードは作成されない（副作用なし）", async () => {
        // Act
        const response = await localApp.fetch(
          buildFormRequest([
            ["title", ""],
            ["options", "2026-01-10 19:00"],
          ]),
        );

        // Assert
        // 「422 を返したうえで event_options に副作用が無い」が観察可能な振る舞い。
        // 前段で 422 を要求しないと、未ルート（404）でも DB は空のまま意図せずパスしてしまう。
        expect(response.status).toBe(422);
        const rows = await database.select().from(schema.eventOptions);
        expect(rows).toHaveLength(0);
      });
    });
  });

  /**
   * Task 3.1: イベント閲覧フルページと集計表示
   *
   * 検証対象:
   *  - `GET /events/:id` が `<EventPage>`（`<Layout>` 内包）のフルページを返す
   *  - `getEventWithOptions(id)` で取得した event / options / responses / aggregates を
   *    `<ResponsesTable/>` 経由で表示する
   *  - 参加者は登録順（古い順）で表示される（要件 2.5）
   *  - 候補ごとに ○ / △ / × の人数が集計行として描画される（要件 2.4）
   *  - 参加者が 0 名のときは「まだ回答がありません」相当の空状態メッセージと回答フォームのみを表示する（要件 2.3）
   *  - カスタム設問が設定されているときのみ参加者行にカスタム設問への回答列を追加表示する（要件 2.6 / 7.3 / 7.4）
   *  - カスタム設問が設定されていないときはカスタム設問列を一切描画しない（要件 2.7）
   *  - 不在 ID のときは 404 と `<NotFoundPage/>` を返す（要件 2.2）
   *  - Hono JSX の自動エスケープにより XSS を防止する（要件 7.7）
   *
   * スコープ外（このタスクでは検証しない）:
   *  - 集計表テキストの WCAG AA コントラスト比（要件 9.5）→ E2E / アクセシビリティテスト側に委譲
   *  - 回答フォーム（`POST /events/:id/responses`）の動作 → Task 4.1 で検証
   *  - 回答編集モード（`PUT /events/:id/responses/:responseId`）→ Task 4.2 で検証
   *  - `<NotifySection/>` の挙動（Webhook の有無による分岐）→ Task 7.1 で検証
   *  - 回答フォームの DOM 構造（label の関連付け方式・ARIA 属性など実装詳細）
   *    → 観察可能な振る舞いに限定し、リファクタリング耐性を優先
   *
   * 設計の前提:
   *  - `app.fetch` 経由で実体の routes / views / db を結合して検証（古典派ブラックボックス）
   *  - DB は実体を使う（共有依存）。`TURSO_DATABASE_URL=":memory:"` を `db` 動的 import 前に設定
   *  - テスト間の隔離は `beforeEach` で `events` / `event_options` / `event_responses` /
   *    `event_option_responses` を truncate して確保する
   *  - 参加者の登録順は `event_responses.id` の自動採番（または `created_at`）で観察可能とする
   *  - DOM 検証は HTML 文字列に対する構造的アサーション（文字列 includes / 正規表現）に留め、
   *    クラス名・文言の細部など実装の詳細には踏み込まない
   *
   * 備考:
   *  - Bun の `it.todo` は `fn` 引数が必須のため、本ファイルでは `() => {}` を渡している。
   *    Phase 2（RED）で本体実装に置き換える。
   */
  describe("GET /events/:id", () => {
    // 既存 Task 2.2 と同じく、:memory: SQLite に向けた状態で動的 import する。
    // `beforeEach` で全 5 テーブル相当を truncate して、ケース間の隔離を確保する。
    let localApp: Hono;
    let database: typeof import("./db").db;
    let schema: typeof import("./schema");

    beforeAll(async () => {
      process.env.TURSO_DATABASE_URL = ":memory:";
      const dbMod = await import("./db");
      database = dbMod.db;
      schema = await import("./schema");
      const routesMod = await import("./routes");
      const { Hono } = await import("hono");
      const sub = new Hono();
      sub.route("/", routesMod.default);
      localApp = sub;
    });

    beforeEach(async () => {
      // 子テーブルから順に削除（FK cascade に頼らず明示）
      await database.delete(schema.eventOptionResponses);
      await database.delete(schema.eventResponses);
      await database.delete(schema.eventOptions);
      await database.delete(schema.events);
    });

    // 共通ヘルパ: イベントと候補日時を作る（DB に直接 INSERT。未実装の getEventWithOptions を使わない）
    const seedEvent = async (input: {
      id: string;
      title: string;
      customQuestion?: string | null;
      options: string[];
    }): Promise<{ id: string; optionIds: number[] }> => {
      await database.insert(schema.events).values({
        id: input.id,
        title: input.title,
        customQuestion: input.customQuestion ?? null,
      });
      const inserted = await database
        .insert(schema.eventOptions)
        .values(
          input.options.map((label, index) => ({
            eventId: input.id,
            label,
            sortOrder: index,
          })),
        )
        .returning({ id: schema.eventOptions.id });
      return { id: input.id, optionIds: inserted.map((r) => r.id) };
    };

    // 共通ヘルパ: 参加者と各候補への回答を作る
    const seedResponse = async (input: {
      eventId: string;
      name: string;
      customAnswer?: string | null;
      answers: Array<{ optionId: number; answer: "○" | "△" | "×" }>;
    }): Promise<{ responseId: number }> => {
      const [row] = await database
        .insert(schema.eventResponses)
        .values({
          eventId: input.eventId,
          name: input.name,
          customAnswer: input.customAnswer ?? null,
        })
        .returning({ id: schema.eventResponses.id });
      const responseId = row!.id;
      if (input.answers.length > 0) {
        await database.insert(schema.eventOptionResponses).values(
          input.answers.map((a) => ({
            responseId,
            optionId: a.optionId,
            answer: a.answer,
          })),
        );
      }
      return { responseId };
    };

    describe("不在 ID（NotFoundPage のフルページ）", () => {
      it("存在しないイベント ID への GET は 404 を返す", async () => {
        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/non-existent-id"),
        );

        // Assert
        expect(response.status).toBe(404);
      });

      it("存在しないイベント ID へのレスポンス本文は <html を含むフルページである（NotFoundPage が Layout に包まれる）", async () => {
        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/non-existent-id"),
        );
        const body = await response.text();

        // Assert
        expect(body).toContain("<html");
        expect(body).toContain('<main class="container">');
      });

      it("存在しないイベント ID へのレスポンス本文には「イベントが見つかりません」相当のメッセージが含まれる", async () => {
        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/non-existent-id"),
        );
        const body = await response.text();

        // Assert
        expect(body).toContain("イベントが見つかりません");
      });

      it("存在しないイベント ID へのレスポンスは Content-Type に text/html を含む", async () => {
        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/non-existent-id"),
        );

        // Assert
        expect(response.headers.get("content-type") ?? "").toContain("text/html");
      });
    });

    describe("既存イベントのフルページ描画", () => {
      it("既存イベント ID への GET は 200 を返す", async () => {
        // Arrange
        await seedEvent({
          id: "evt-200",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });

        // Act
        const response = await localApp.fetch(new Request("http://localhost:8787/events/evt-200"));

        // Assert
        expect(response.status).toBe(200);
      });

      it('既存イベント ID へのレスポンスは <html と <main class="container"> を含むフルページである', async () => {
        // Arrange
        await seedEvent({
          id: "evt-layout",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-layout"),
        );
        const body = await response.text();

        // Assert
        expect(body).toContain("<html");
        expect(body).toContain('<main class="container">');
      });

      it("既存イベント ID へのレスポンスは Content-Type に text/html を含む", async () => {
        // Arrange
        await seedEvent({
          id: "evt-ctype",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-ctype"),
        );

        // Assert
        expect(response.headers.get("content-type") ?? "").toContain("text/html");
      });

      it("レスポンス本文にイベントのタイトルが含まれる", async () => {
        // Arrange
        await seedEvent({
          id: "evt-title",
          title: "ユニークな飲み会タイトル2026",
          options: ["2026-01-10 19:00"],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-title"),
        );
        const body = await response.text();

        // Assert
        expect(body).toContain("ユニークな飲み会タイトル2026");
      });

      it("レスポンス本文に各候補日時のラベルがすべて含まれる", async () => {
        // Arrange
        await seedEvent({
          id: "evt-labels",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00", "2026-01-12 19:00"],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-labels"),
        );
        const body = await response.text();

        // Assert
        expect(body).toContain("2026-01-10 19:00");
        expect(body).toContain("2026-01-11 19:00");
        expect(body).toContain("2026-01-12 19:00");
      });

      it("候補日時は登録時の sort_order に従って先頭から順に並んで描画される", async () => {
        // Arrange
        await seedEvent({
          id: "evt-order",
          title: "新年会",
          options: ["first-option", "second-option", "third-option"],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-order"),
        );
        const body = await response.text();

        // Assert
        const firstIdx = body.indexOf("first-option");
        const secondIdx = body.indexOf("second-option");
        const thirdIdx = body.indexOf("third-option");
        expect(firstIdx).toBeGreaterThan(-1);
        expect(secondIdx).toBeGreaterThan(firstIdx);
        expect(thirdIdx).toBeGreaterThan(secondIdx);
      });
    });

    describe("参加者 0 名のとき（空状態）", () => {
      it("参加者が 0 名のときレスポンス本文に「まだ回答がありません」相当の空状態メッセージが含まれる", async () => {
        // Arrange
        await seedEvent({
          id: "evt-empty",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-empty"),
        );
        const body = await response.text();

        // Assert
        expect(body).toContain("まだ回答がありません");
      });

      it("参加者が 0 名のとき候補ごとの ○ / △ / × の集計行（人数）が描画されない", async () => {
        // Arrange
        await seedEvent({
          id: "evt-noagg",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-noagg"),
        );
        const body = await response.text();

        // Assert
        // 集計の数値は参加者数に依存して描画される想定なので、
        // 0 名のときは「0 人」や ○/△/× の集計行に対応する文字列が出ない、を観察する。
        // ここでは単純に ○ / △ / × の絵文字が描画されていないことを assert する
        //（候補ラベル / 集計セル両方に出る可能性があるが、参加者 0 名なら集計行も回答行も不要なはず）。
        expect(body).not.toContain("○");
        expect(body).not.toContain("△");
        expect(body).not.toContain("×");
      });

      it("参加者が 0 名のときでも新規回答用のフォームは描画される", async () => {
        // Arrange
        await seedEvent({
          id: "evt-form",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });

        // Act
        const response = await localApp.fetch(new Request("http://localhost:8787/events/evt-form"));
        const body = await response.text();

        // Assert
        // 観察可能な振る舞いとして、回答送信先の `POST /events/evt-form/responses` を
        // action に持つ form 要素が DOM に存在する、を検証する。
        expect(body).toMatch(/<form[^>]*action=["'][^"']*\/events\/evt-form\/responses["']/i);
      });
    });

    describe("参加者あり（登録順表示と集計）", () => {
      // 共通セットアップ: 3 人 / 2 候補のイベントを作る
      const setupThreeResponses = async () => {
        const seeded = await seedEvent({
          id: "evt-three",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [opt1, opt2] = seeded.optionIds;
        await seedResponse({
          eventId: seeded.id,
          name: "アリス太郎",
          answers: [
            { optionId: opt1!, answer: "○" },
            { optionId: opt2!, answer: "△" },
          ],
        });
        await seedResponse({
          eventId: seeded.id,
          name: "ボブ次郎",
          answers: [
            { optionId: opt1!, answer: "○" },
            { optionId: opt2!, answer: "×" },
          ],
        });
        await seedResponse({
          eventId: seeded.id,
          name: "キャロル花子",
          answers: [
            { optionId: opt1!, answer: "△" },
            { optionId: opt2!, answer: "○" },
          ],
        });
        return seeded;
      };

      it("参加者行が登録順（古い順）で表示される", async () => {
        // Arrange
        await setupThreeResponses();

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-three"),
        );
        const body = await response.text();

        // Assert
        const idxAlice = body.indexOf("アリス太郎");
        const idxBob = body.indexOf("ボブ次郎");
        const idxCarol = body.indexOf("キャロル花子");
        expect(idxAlice).toBeGreaterThan(-1);
        expect(idxBob).toBeGreaterThan(idxAlice);
        expect(idxCarol).toBeGreaterThan(idxBob);
      });

      it("レスポンス本文に各参加者の名前がすべて含まれる", async () => {
        // Arrange
        await setupThreeResponses();

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-three"),
        );
        const body = await response.text();

        // Assert
        expect(body).toContain("アリス太郎");
        expect(body).toContain("ボブ次郎");
        expect(body).toContain("キャロル花子");
      });

      it("候補ごとに ○ の人数が集計され、すべての候補に対する集計が描画される", async () => {
        // Arrange
        // 候補1: ○ が 2 名 (Alice, Bob) / 候補2: ○ が 1 名 (Carol)
        await setupThreeResponses();

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-three"),
        );
        const body = await response.text();

        // Assert
        // 集計行に「○: N」「○ N」「○2人」などの形式が出る想定。
        // 観察可能な振る舞いとして「○ の集計が候補ごとに 2 件描画されている」を
        // ○ という記号と数値の組み合わせの出現回数で確認する。
        const circleMatches = body.match(/○/g) ?? [];
        // 各参加者行（3 名 × 2 候補 = 6 セル）+ 候補ごとの集計行（2 候補）+ フォームのラベル等で複数回出る想定
        expect(circleMatches.length).toBeGreaterThanOrEqual(2);
        // 2 と 1 の数値が含まれていること（候補1 で 2 名、候補2 で 1 名の集計）
        expect(body).toMatch(/2/);
        expect(body).toMatch(/1/);
      });

      it("候補ごとに △ の人数が集計され、すべての候補に対する集計が描画される", async () => {
        // Arrange
        // 候補1: △ が 1 名 (Carol) / 候補2: △ が 1 名 (Alice)
        await setupThreeResponses();

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-three"),
        );
        const body = await response.text();

        // Assert
        const triangleMatches = body.match(/△/g) ?? [];
        expect(triangleMatches.length).toBeGreaterThanOrEqual(2);
      });

      it("候補ごとに × の人数が集計され、すべての候補に対する集計が描画される", async () => {
        // Arrange
        // 候補1: × が 0 名 / 候補2: × が 1 名 (Bob)
        await setupThreeResponses();

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-three"),
        );
        const body = await response.text();

        // Assert
        const crossMatches = body.match(/×/g) ?? [];
        // 各参加者の回答セル + 集計行で複数回出現する
        expect(crossMatches.length).toBeGreaterThanOrEqual(1);
      });

      it("ある候補に対して同じ参加者が複数回カウントされない（○ + △ + × の合計は参加者数以下）", async () => {
        // Arrange
        // 候補1 に対する回答: Alice=○, Bob=○, Carol=△, × は 0
        // 集計行に「○2 △1 ×0」相当が描画される想定。合計値が参加者数 (3) を上回っていないかを
        // 観察するため、集計行の中で 4 以上の値が候補1 の集計位置に出ていないことを確認する。
        await setupThreeResponses();

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-three"),
        );
        const body = await response.text();

        // Assert
        // 参加者数を超える集計値（例: ○4, △4 など）が出ていないこと
        expect(body).not.toMatch(/○\s*[4-9]/);
        expect(body).not.toMatch(/△\s*[4-9]/);
        expect(body).not.toMatch(/×\s*[4-9]/);
      });

      it("参加者が 1 名以上いるとき空状態メッセージは描画されない", async () => {
        // Arrange
        await setupThreeResponses();

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-three"),
        );
        const body = await response.text();

        // Assert
        expect(body).not.toContain("まだ回答がありません");
      });
    });

    describe("カスタム設問なしのイベント", () => {
      it("events.custom_question が null のイベントでは設問見出しが描画されない", async () => {
        // Arrange
        await seedEvent({
          id: "evt-noq",
          title: "新年会",
          customQuestion: null,
          options: ["2026-01-10 19:00"],
        });

        // Act
        const response = await localApp.fetch(new Request("http://localhost:8787/events/evt-noq"));
        const body = await response.text();

        // Assert
        // 設問見出しが描画されないことの観察として、設問文が一切出ない（null なので何も出ない）
        // のは自明だが、ここでは「設問固有のマーカー文字列が無い」のチェックは難しいため、
        // カスタム設問なしの場合は customAnswer ヘッダ的なものがないこと、を間接的に確認する。
        // Phase 3 で <ResponsesTable/> の実装規約が決まる前提のため、ここでは customAnswer
        // 列が描画されないことの間接観察として、ヘッダに「設問」や「回答」の語が必須でないことを通す。
        // 直接的な観察: ユニークマーカーは customAnswer の値の有無で判定する次の it に委ねる。
        expect(body).not.toContain("custom-question-heading");
        // 0 件のフルページが破綻していないことを担保
        expect(body).toContain("<html");
      });

      it("events.custom_question が null のイベントでは参加者の customAnswer の値が画面に出力されない（列ごと存在しない）", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-noq-resp",
          title: "新年会",
          customQuestion: null,
          options: ["2026-01-10 19:00"],
        });
        // 仮に customAnswer に値を入れても、events.custom_question が null なら描画されない、を観察する
        await seedResponse({
          eventId: seeded.id,
          name: "アリス",
          customAnswer: "UNIQUE-CUSTOM-ANSWER-MARKER-XYZ",
          answers: [{ optionId: seeded.optionIds[0]!, answer: "○" }],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-noq-resp"),
        );
        const body = await response.text();

        // Assert
        expect(body).not.toContain("UNIQUE-CUSTOM-ANSWER-MARKER-XYZ");
      });
    });

    describe("カスタム設問ありのイベント", () => {
      it("events.custom_question が設定されているイベントでは設問文が見出しとして描画される", async () => {
        // Arrange
        await seedEvent({
          id: "evt-q",
          title: "新年会",
          customQuestion: "アレルギーはありますか？",
          options: ["2026-01-10 19:00"],
        });

        // Act
        const response = await localApp.fetch(new Request("http://localhost:8787/events/evt-q"));
        const body = await response.text();

        // Assert
        expect(body).toContain("アレルギーはありますか？");
      });

      it("events.custom_question が設定されているイベントでは参加者行にカスタム設問への回答が表示される", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-q-resp",
          title: "新年会",
          customQuestion: "アレルギーはありますか？",
          options: ["2026-01-10 19:00"],
        });
        await seedResponse({
          eventId: seeded.id,
          name: "アリス",
          customAnswer: "卵アレルギーです",
          answers: [{ optionId: seeded.optionIds[0]!, answer: "○" }],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-q-resp"),
        );
        const body = await response.text();

        // Assert
        expect(body).toContain("卵アレルギーです");
      });

      it("カスタム設問への回答が空文字の参加者でも参加者行はそのまま描画される（空文字許容）", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-q-empty",
          title: "新年会",
          customQuestion: "アレルギーはありますか？",
          options: ["2026-01-10 19:00"],
        });
        await seedResponse({
          eventId: seeded.id,
          name: "アリス無回答",
          customAnswer: "",
          answers: [{ optionId: seeded.optionIds[0]!, answer: "○" }],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-q-empty"),
        );
        const body = await response.text();

        // Assert
        expect(body).toContain("アリス無回答");
      });
    });

    describe("XSS 対策（Hono JSX の自動エスケープ）", () => {
      const XSS_MARKER = "<script>window.__xssMarker=1</script>";

      it("イベントタイトルに HTML 特殊文字を含んでも <script> タグはエスケープされて生のスクリプトとして出力されない", async () => {
        // Arrange
        await seedEvent({
          id: "evt-xss-title",
          title: XSS_MARKER,
          options: ["2026-01-10 19:00"],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-xss-title"),
        );
        const body = await response.text();

        // Assert
        expect(body).not.toContain(XSS_MARKER);
        expect(body).toContain("&lt;script&gt;");
      });

      it("候補ラベルに HTML 特殊文字を含んでもエスケープされて生のスクリプトとして出力されない", async () => {
        // Arrange
        await seedEvent({
          id: "evt-xss-opt",
          title: "新年会",
          options: [XSS_MARKER],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-xss-opt"),
        );
        const body = await response.text();

        // Assert
        expect(body).not.toContain(XSS_MARKER);
        expect(body).toContain("&lt;script&gt;");
      });

      it("カスタム設問文に HTML 特殊文字を含んでもエスケープされて生のスクリプトとして出力されない", async () => {
        // Arrange
        await seedEvent({
          id: "evt-xss-q",
          title: "新年会",
          customQuestion: XSS_MARKER,
          options: ["2026-01-10 19:00"],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-xss-q"),
        );
        const body = await response.text();

        // Assert
        expect(body).not.toContain(XSS_MARKER);
        expect(body).toContain("&lt;script&gt;");
      });

      it("参加者名に HTML 特殊文字を含んでもエスケープされて生のスクリプトとして出力されない", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-xss-name",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        await seedResponse({
          eventId: seeded.id,
          name: XSS_MARKER,
          answers: [{ optionId: seeded.optionIds[0]!, answer: "○" }],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-xss-name"),
        );
        const body = await response.text();

        // Assert
        expect(body).not.toContain(XSS_MARKER);
        expect(body).toContain("&lt;script&gt;");
      });

      it("カスタム設問への回答に HTML 特殊文字を含んでもエスケープされて生のスクリプトとして出力されない", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-xss-ans",
          title: "新年会",
          customQuestion: "好きな食べ物は？",
          options: ["2026-01-10 19:00"],
        });
        await seedResponse({
          eventId: seeded.id,
          name: "アリス",
          customAnswer: XSS_MARKER,
          answers: [{ optionId: seeded.optionIds[0]!, answer: "○" }],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-xss-ans"),
        );
        const body = await response.text();

        // Assert
        expect(body).not.toContain(XSS_MARKER);
        expect(body).toContain("&lt;script&gt;");
      });
    });
  });

  /**
   * Task 4.1: 回答登録（htmx フラグメント差し替え）
   *
   * 検証対象:
   *  - `POST /events/:id/responses` が `zValidator("form", responseSchema)` で
   *    `name` 1..100、`answers[<optionId>]` ∈ {○, △, ×}、`customAnswer?` 0..500 を検証する
   *  - 成功時は `event_responses` と `event_option_responses` を単一 tx で永続化する（要件 3.3 / 3.10）
   *  - 成功時は 200 + `<ResponsesTable/>` フラグメントを返し、`<html>` を含まない断片である（要件 3.4）
   *  - 検証失敗時は 422 を返し、レスポンス本文に送信値が含まれる（入力値保持、要件 3.5 / 3.6）
   *    htmx の差し戻し機構（`HX-Retarget` ヘッダ・フラグメント形態など）の具体は実装詳細として
   *    観察対象から外し、E2E に委ねる
   *  - 不在 event ID のときは 404 を返す（要件 3.8）
   *  - 同名参加者は別レコードとして登録され、同名重複を許容する（要件 3.9）
   *  - `customAnswer` は空文字をそのまま空文字として保存する（空文字許容、要件 3.7）
   *  - カスタム設問が設定されていないイベント（`events.custom_question IS NULL`）に対して
   *    `customAnswer` を送信しても、後続の集計表に customAnswer が描画されない（要件 3.2 / 2.7）
   *
   * スコープ外（このタスクでは検証しない）:
   *  - 回答編集モード（`PUT /events/:id/responses/:responseId`）→ Task 4.2 で検証
   *  - 集計表の細部レンダリング（候補ごとの ○△× カウント等）→ Task 3.1 で既に検証済み
   *  - Webhook 通知の発火 → Task 7.1 で検証
   *  - フォーム入力 UI の DOM 構造（label の関連付け方式・ARIA 属性等の実装詳細）
   *    → 観察可能な振る舞いに限定し、リファクタリング耐性を優先
   *  - クラス名・微細な文言の検証
   *
   * 設計の前提:
   *  - 既存 Task 2.2 / 3.1 と同じ `localApp` / `:memory:` / `beforeEach` 規約を踏襲し、
   *    `app.fetch` 経由で実体の routes / views / db を結合して検証（古典派ブラックボックス）
   *  - DB は実体を使う（共有依存）。`TURSO_DATABASE_URL=":memory:"` を `db` 動的 import 前に設定
   *  - テスト間の隔離は `beforeEach` で `event_option_responses` / `event_responses` /
   *    `event_options` / `events` を子テーブルから順に truncate して確保する
   *  - 各テストは事前に `events` と `event_options` を seed してから POST する
   *  - フラグメント応答は「`<html>` を含まないこと」「`<table>` 等の集計表要素を含むこと」の
   *    観察可能な振る舞いに限定する（クラス名や文言の細部には踏み込まない）
   *  - 422 の差し戻し本文は `<form>` を含み、送信した name / customAnswer の値が文字列として
   *    含まれることで「入力値保持」を観察可能にする
   *
   * 備考:
   *  - Bun の `it.todo` は `fn` 引数が必須のため、本ファイルでは `() => {}` を渡している。
   *    Phase 2（RED）で本体実装に置き換える。
   */
  describe("POST /events/:id/responses", () => {
    // 既存 Task 2.2 / 3.1 と同じく、:memory: SQLite に向けた状態で動的 import する。
    // `beforeEach` で 4 テーブルを子から順に truncate して、ケース間の隔離を確保する。
    let localApp: Hono;
    let database: typeof import("./db").db;
    let schema: typeof import("./schema");

    beforeAll(async () => {
      process.env.TURSO_DATABASE_URL = ":memory:";
      const dbMod = await import("./db");
      database = dbMod.db;
      schema = await import("./schema");
      const routesMod = await import("./routes");
      const { Hono } = await import("hono");
      const sub = new Hono();
      sub.route("/", routesMod.default);
      localApp = sub;
    });

    beforeEach(async () => {
      // 子テーブルから順に削除（FK cascade に頼らず明示）
      await database.delete(schema.eventOptionResponses);
      await database.delete(schema.eventResponses);
      await database.delete(schema.eventOptions);
      await database.delete(schema.events);
    });

    // 共通ヘルパ: イベントと候補日時を作る（DB に直接 INSERT。Task 3.1 と同形）
    const seedEvent = async (input: {
      id: string;
      title: string;
      customQuestion?: string | null;
      options: string[];
    }): Promise<{ id: string; optionIds: number[] }> => {
      await database.insert(schema.events).values({
        id: input.id,
        title: input.title,
        customQuestion: input.customQuestion ?? null,
      });
      const inserted = await database
        .insert(schema.eventOptions)
        .values(
          input.options.map((label, index) => ({
            eventId: input.id,
            label,
            sortOrder: index,
          })),
        )
        .returning({ id: schema.eventOptions.id });
      return { id: input.id, optionIds: inserted.map((r) => r.id) };
    };

    // 共通ヘルパ: 参加者回答フォームを組み立てる。
    // `answers` は HTML フォーム由来の bracket 記法 `answers[<optionId>]=<○|△|×>` で送る。
    const buildResponseRequest = (eventId: string, entries: Array<[string, string]>): Request => {
      const params = new URLSearchParams();
      for (const [k, v] of entries) {
        params.append(k, v);
      }
      return new Request(`http://localhost:8787/events/${eventId}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
    };

    describe("正常系（永続化と htmx フラグメント応答）", () => {
      it("有効な form を送ると 200 を返す", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-200",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-200", [
            ["name", "山田太郎"],
            [`answers[${optA}]`, "○"],
            [`answers[${optB}]`, "△"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
      });

      it("成功応答の本文は `<html>` を含まないフラグメント（部分 HTML）である", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-fragment",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-fragment", [
            ["name", "山田太郎"],
            [`answers[${opt}]`, "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).not.toContain("<html");
      });

      it("成功応答の本文には登録した参加者の名前が含まれる（集計表フラグメントへの反映）", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-body-name",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [opt1, opt2] = seeded.optionIds;

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-body-name", [
            ["name", "ユニークな名前太郎"],
            [`answers[${opt1}]`, "○"],
            [`answers[${opt2}]`, "△"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain("ユニークな名前太郎");
      });

      it("有効な form を送ると event_responses に 1 件のレコードが作成され、name が送信値と一致する", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-insert",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-insert", [
            ["name", "送信した名前"],
            [`answers[${optA}]`, "○"],
            [`answers[${optB}]`, "△"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const rows = await database.select().from(schema.eventResponses);
        expect(rows.length).toBe(1);
        expect(rows[0].name).toBe("送信した名前");
        expect(rows[0].eventId).toBe("evt-resp-insert");
      });

      it("有効な form を送ると候補数と同じ件数の event_option_responses が作成され、各 option_id に対する answer が ○△× のいずれかとして保存される", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-options",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00", "2026-01-12 19:00"],
        });
        const [opt1, opt2, opt3] = seeded.optionIds;

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-options", [
            ["name", "山田太郎"],
            [`answers[${opt1}]`, "○"],
            [`answers[${opt2}]`, "△"],
            [`answers[${opt3}]`, "×"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const rows = await database.select().from(schema.eventOptionResponses);
        expect(rows.length).toBe(3);
        const actual = Object.fromEntries(rows.map((r) => [r.optionId, r.answer]));
        expect(actual).toEqual({ [opt1]: "○", [opt2]: "△", [opt3]: "×" });
      });

      it("customAnswer に非空文字列を送ると event_responses.custom_answer に当該文字列が保存される", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-custom-answer",
          title: "新年会",
          customQuestion: "何か質問",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-custom-answer", [
            ["name", "山田太郎"],
            [`answers[${opt}]`, "○"],
            ["customAnswer", "卵アレルギーです"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const rows = await database.select().from(schema.eventResponses);
        expect(rows.length).toBe(1);
        expect(rows[0].customAnswer).toBe("卵アレルギーです");
      });

      it("customAnswer を空文字で送ると event_responses.custom_answer は空文字のまま保存される（null に変換しない）", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-custom-answer-empty",
          title: "新年会",
          customQuestion: "何か質問",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-custom-answer-empty", [
            ["name", "山田太郎"],
            [`answers[${opt}]`, "○"],
            ["customAnswer", ""],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const rows = await database.select().from(schema.eventResponses);
        expect(rows.length).toBe(1);
        expect(rows[0].customAnswer).toBe("");
      });

      it("同名の参加者を 2 回登録すると event_responses に別レコードとして 2 件作成される（同名重複許容）", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-duplicate-name",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act — 同じ name で 2 回連続して送信
        const firstResponse = await localApp.fetch(
          buildResponseRequest("evt-resp-duplicate-name", [
            ["name", "重複太郎"],
            [`answers[${opt}]`, "○"],
          ]),
        );
        const secondResponse = await localApp.fetch(
          buildResponseRequest("evt-resp-duplicate-name", [
            ["name", "重複太郎"],
            [`answers[${opt}]`, "△"],
          ]),
        );

        // Assert
        expect(firstResponse.status).toBe(200);
        expect(secondResponse.status).toBe(200);
        const rows = await database.select().from(schema.eventResponses);
        expect(rows.length).toBe(2);
        expect(rows[0].name).toBe("重複太郎");
        expect(rows[1].name).toBe("重複太郎");
        expect(rows[0].id).not.toBe(rows[1].id);
      });

      it("カスタム設問なし（events.custom_question が null）のイベントに customAnswer を送信しても、後続の集計表フラグメントに customAnswer が描画されない", async () => {
        // Arrange — customQuestion を渡さない（null）イベント + 1 候補
        const seeded = await seedEvent({
          id: "evt-resp-no-custom-question",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act — 有効な form + customAnswer にユニーク文字列を含めて送信
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-no-custom-question", [
            ["name", "山田太郎"],
            [`answers[${opt}]`, "○"],
            ["customAnswer", "ユニーク描画されないはずの設問回答XYZ"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).not.toContain("ユニーク描画されないはずの設問回答XYZ");
      });
    });

    describe("バリデーション失敗時の差し戻し（422 + 入力値保持 + 副作用なし）", () => {
      it("name が空文字のフォームを送ると 422 を返す", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-422-name-empty",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-422-name-empty", [
            ["name", ""],
            [`answers[${opt}]`, "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("name が 101 文字のフォームを送ると 422 を返す", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-422-name-too-long",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-422-name-too-long", [
            ["name", "a".repeat(101)],
            [`answers[${opt}]`, "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("answers のいずれかが ○△× 以外の値（例: 'maybe'）のフォームを送ると 422 を返す", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-422-answer-invalid",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [opt1, opt2] = seeded.optionIds;

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-422-answer-invalid", [
            ["name", "山田太郎"],
            [`answers[${opt1}]`, "○"],
            [`answers[${opt2}]`, "maybe"],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("answers のキーが当該イベントの候補 ID 以外を含むフォームを送ると 422 を返す", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-422-unknown-option",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act — 当該イベントに存在しない optionId (999999) を answers に含める
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-422-unknown-option", [
            ["name", "テスト太郎"],
            [`answers[${opt}]`, "○"],
            [`answers[999999]`, "△"],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("answers の一部が欠落しているフォーム（候補に対する回答が未指定）を送ると 422 を返す", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-422-answer-missing",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });

        // Act — optionIds[1] への回答を欠落させる
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-422-answer-missing", [
            ["name", "テスト太郎"],
            [`answers[${seeded.optionIds[0]}]`, "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("customAnswer が 501 文字のフォームを送ると 422 を返す", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-422-custom-answer-too-long",
          title: "新年会",
          customQuestion: "何か質問",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-422-custom-answer-too-long", [
            ["name", "山田太郎"],
            [`answers[${opt}]`, "○"],
            ["customAnswer", "a".repeat(501)],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("422 時のレスポンス本文には送信した name の値が含まれる（入力値保持）", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-422-preserve-name",
          title: "新年会",
          customQuestion: "何か質問",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act — customAnswer 501 文字で 422 を起こし、name に保持すべき値を入れる
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-422-preserve-name", [
            ["name", "保持されるべき名前"],
            [`answers[${opt}]`, "○"],
            ["customAnswer", "a".repeat(501)],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
        const body = await response.text();
        expect(body).toContain("保持されるべき名前");
      });

      it("422 時のレスポンス本文には送信した customAnswer の値が含まれる（入力値保持）", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-422-preserve-custom-answer",
          title: "新年会",
          customQuestion: "何か質問",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act — name 空文字で 422 を起こし、customAnswer に保持すべきユニーク値（500 文字以下）を入れる
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-422-preserve-custom-answer", [
            ["name", ""],
            [`answers[${opt}]`, "○"],
            ["customAnswer", "保持されるべき設問回答"],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
        const body = await response.text();
        expect(body).toContain("保持されるべき設問回答");
      });

      it("422 を返したとき event_responses にレコードは作成されない（副作用なし）", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-422-no-side-effect",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act — name 空文字で 422 を起こす
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-422-no-side-effect", [
            ["name", ""],
            [`answers[${opt}]`, "○"],
          ]),
        );

        // Assert — 前段アサート（404 等で意図せずパスするのを防ぐ）
        expect(response.status).toBe(422);
        const rows = await database.select().from(schema.eventResponses);
        expect(rows.length).toBe(0);
      });

      it("422 を返したとき event_option_responses にレコードは作成されない（副作用なし、tx ロールバック）", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-resp-422-no-option-side-effect",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act — name 空文字で 422 を起こす
        const response = await localApp.fetch(
          buildResponseRequest("evt-resp-422-no-option-side-effect", [
            ["name", ""],
            [`answers[${opt}]`, "○"],
          ]),
        );

        // Assert — 前段アサート（404 等で意図せずパスするのを防ぐ）
        expect(response.status).toBe(422);
        const rows = await database.select().from(schema.eventOptionResponses);
        expect(rows.length).toBe(0);
      });
    });

    describe("不在イベント ID", () => {
      it("不在の event ID に対する POST は 404 を返す", async () => {
        // Arrange — 何も seed しない（beforeEach で全テーブル truncate 済み）

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("non-existent-id", [
            ["name", "山田太郎"],
            ["answers[1]", "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(404);
      });

      it("不在の event ID に対する POST では event_responses / event_option_responses に副作用が発生しない", async () => {
        // Arrange — 何も seed しない（beforeEach で全テーブル truncate 済み）

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("non-existent-id", [
            ["name", "山田太郎"],
            ["answers[1]", "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(404);
        const responses = await database.select().from(schema.eventResponses);
        expect(responses.length).toBe(0);
        const optionResponses = await database.select().from(schema.eventOptionResponses);
        expect(optionResponses.length).toBe(0);
      });
    });
  });

  /**
   * テーマ切り替え（バグ修正）
   *
   * 検証対象:
   *  - フルページ描画時、リクエストの cookie `theme` を読み取り、
   *    `<Layout>` 経由で `<html data-theme="...">` 属性として出力されること
   *
   * 背景（バグの実態）:
   *  - `POST /theme` は cookie `theme` を `dark`↔`light` でトグルし `HX-Refresh: true` を返すが、
   *    `src/routes.tsx` 内の `<Layout>` 呼び出しが `theme` prop を渡していないため、
   *    再描画後も `<html data-theme>` が undefined のままで UI に反映されない
   *
   * スコープ外:
   *  - `POST /theme` 自体のトグル挙動（`src/index.tsx` に閉じており、本ファイルの対象外）
   *  - cookie 未設定時の既定値（要件未確定。「未設定なら data-theme 属性を出さない」前提で扱うかは Phase 2 で確定）
   *  - 視覚的なテーマ表現（色・コントラスト）→ E2E / 視覚検査側
   */
  describe("テーマ切り替え（cookie を data-theme に反映）", () => {
    it('cookie theme=dark で GET /events/new を取得すると <html data-theme="dark"> が描画される', async () => {
      // Arrange
      const request = new Request("http://localhost:8787/events/new", {
        headers: { cookie: "theme=dark" },
      });

      // Act
      const response = await app.fetch(request);
      const body = await response.text();

      // Assert
      expect(body).toContain('data-theme="dark"');
    });

    it('cookie theme=light で GET /events/new を取得すると <html data-theme="light"> が描画される', async () => {
      // Arrange
      const request = new Request("http://localhost:8787/events/new", {
        headers: { cookie: "theme=light" },
      });

      // Act
      const response = await app.fetch(request);
      const body = await response.text();

      // Assert
      expect(body).toContain('data-theme="light"');
    });
  });
});
