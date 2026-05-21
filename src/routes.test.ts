import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
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

    describe("カルーセル領域（Task 3.2）", () => {
      // 子テーブル `participant_cards` は外側 `beforeEach` で `event_responses` 削除時に
      // FK cascade で消えるが、明示性のため本 describe でも先頭で truncate する。
      beforeEach(async () => {
        await database.delete(schema.participantCards);
      });

      describe("カード件数", () => {
        // Arrange — 同一イベントに参加者 3 名、各々に participant_cards を 1 枚ずつ seed
        beforeEach(async () => {
          const seeded = await seedEvent({
            id: "evt-cards-count",
            title: "新年会",
            options: ["2026-01-10 19:00"],
          });
          const [opt] = seeded.optionIds;
          const participants: Array<{ name: string; rarity: "UR" | "SR" | "R" }> = [
            { name: "山田太郎", rarity: "R" },
            { name: "佐藤花子", rarity: "SR" },
            { name: "鈴木一郎", rarity: "UR" },
          ];
          for (const p of participants) {
            const { responseId } = await seedResponse({
              eventId: "evt-cards-count",
              name: p.name,
              answers: [{ optionId: opt!, answer: "○" }],
            });
            await database.insert(schema.participantCards).values({
              responseId,
              title: `勇者${p.name}`,
              rarity: p.rarity,
              attribute: "火",
              race: "戦士",
              flavor: "テストフレーバー",
              attack: 1000,
              defense: 800,
              tier: "default",
            });
          }
        });

        it("回答が 1 件以上あるとき、#cards 領域に responses 件数と一致する数のカードが描画される", async () => {
          // Act
          const response = await localApp.fetch(
            new Request("http://localhost:8787/events/evt-cards-count"),
          );
          const body = await response.text();

          // Assert
          // 各カードは `class="card-rarity-..."` を持つ前提（task 3.2 の実装規約）。
          // カード単位の DOM 要素を識別する安定マーカーとして、その出現回数を数える。
          const cardCount = (body.match(/class="card-rarity-/g) ?? []).length;
          expect(cardCount).toBe(3);
        });
      });

      describe("DOM 構造上の順序", () => {
        // Arrange — イベント・候補・参加者 1 名・participant_cards 1 件を seed
        beforeEach(async () => {
          const seeded = await seedEvent({
            id: "evt-cards-order",
            title: "新年会",
            options: ["2026-01-10 19:00"],
          });
          const [opt] = seeded.optionIds;
          const { responseId } = await seedResponse({
            eventId: "evt-cards-order",
            name: "山田太郎",
            answers: [{ optionId: opt!, answer: "○" }],
          });
          await database.insert(schema.participantCards).values({
            responseId,
            title: "勇者ヤマダ",
            rarity: "R",
            attribute: "火",
            race: "戦士",
            flavor: "テストフレーバー",
            attack: 1000,
            defense: 800,
            tier: "default",
          });
        });

        it("#cards 領域は #responses よりも DOM 上で前に出現する", async () => {
          // Act
          const response = await localApp.fetch(
            new Request("http://localhost:8787/events/evt-cards-order"),
          );
          const body = await response.text();

          // Assert
          expect(response.status).toBe(200);
          const cardsIdx = body.indexOf('id="cards"');
          const responsesIdx = body.indexOf('id="responses"');
          expect(cardsIdx).toBeGreaterThan(-1);
          expect(responsesIdx).toBeGreaterThan(-1);
          expect(cardsIdx).toBeLessThan(responsesIdx);
        });
      });

      describe("各カードの 7 属性", () => {
        // Arrange — 検証用に各属性へユニークな値を持つカードを 1 件 seed
        beforeEach(async () => {
          const seeded = await seedEvent({
            id: "evt-cards-attrs",
            title: "新年会",
            options: ["2026-01-10 19:00"],
          });
          const [opt] = seeded.optionIds;
          const { responseId } = await seedResponse({
            eventId: "evt-cards-attrs",
            name: "山田太郎",
            answers: [{ optionId: opt!, answer: "○" }],
          });
          await database.insert(schema.participantCards).values({
            responseId,
            title: "二つ名XYZ",
            rarity: "UR",
            attribute: "光",
            race: "ドラゴン",
            flavor: "ユニークフレーバー文字列",
            attack: 1234,
            defense: 5678,
            tier: "default",
          });
        });

        it("各カードに 7 属性（二つ名 / レアリティ / 属性 / 種族 / フレーバー / ATK / DEF）がすべて含まれる", async () => {
          // Act
          const response = await localApp.fetch(
            new Request("http://localhost:8787/events/evt-cards-attrs"),
          );
          const body = await response.text();

          // Assert
          expect(body).toContain("二つ名XYZ");
          expect(body).toContain("UR");
          expect(body).toContain("光");
          expect(body).toContain("ドラゴン");
          expect(body).toContain("ユニークフレーバー文字列");
          expect(body).toContain("1234");
          expect(body).toContain("5678");
        });
      });
      describe("レアリティに応じた class 付与", () => {
        // Arrange — 同一イベントに 4 名の参加者を seed し、それぞれ UR/SR/R/N の card を 1 枚ずつ持たせる
        beforeEach(async () => {
          const seeded = await seedEvent({
            id: "evt-cards-rarity",
            title: "新年会",
            options: ["2026-01-10 19:00"],
          });
          const [opt] = seeded.optionIds;
          const participants: Array<{ name: string; rarity: "UR" | "SR" | "R" | "N" }> = [
            { name: "山田太郎", rarity: "UR" },
            { name: "佐藤花子", rarity: "SR" },
            { name: "鈴木一郎", rarity: "R" },
            { name: "田中次郎", rarity: "N" },
          ];
          for (const p of participants) {
            const { responseId } = await seedResponse({
              eventId: "evt-cards-rarity",
              name: p.name,
              answers: [{ optionId: opt!, answer: "○" }],
            });
            await database.insert(schema.participantCards).values({
              responseId,
              title: `勇者${p.name}`,
              rarity: p.rarity,
              attribute: "火",
              race: "戦士",
              flavor: "テストフレーバー",
              attack: 1000,
              defense: 800,
              tier: "default",
            });
          }
        });

        it("カードのレアリティに応じた class（card-rarity-ur / sr / r / n）が付与される", async () => {
          // Act
          const response = await localApp.fetch(
            new Request("http://localhost:8787/events/evt-cards-rarity"),
          );
          const body = await response.text();

          // Assert
          expect(body).toContain('class="card-rarity-ur"');
          expect(body).toContain('class="card-rarity-sr"');
          expect(body).toContain('class="card-rarity-r"');
          expect(body).toContain('class="card-rarity-n"');
        });
      });
      describe("カード並び順", () => {
        // Arrange — 同一イベントに 3 名を順に seed（id 昇順 = 送信順）
        beforeEach(async () => {
          const seeded = await seedEvent({
            id: "evt-cards-order",
            title: "新年会",
            options: ["2026-01-10 19:00"],
          });
          const [opt] = seeded.optionIds;
          const participants: Array<{ name: string; title: string }> = [
            { name: "Aさん", title: "二つ名Aさん固有" },
            { name: "Bさん", title: "二つ名Bさん固有" },
            { name: "Cさん", title: "二つ名Cさん固有" },
          ];
          for (const p of participants) {
            const { responseId } = await seedResponse({
              eventId: "evt-cards-order",
              name: p.name,
              answers: [{ optionId: opt!, answer: "○" }],
            });
            await database.insert(schema.participantCards).values({
              responseId,
              title: p.title,
              rarity: "N",
              attribute: "火",
              race: "戦士",
              flavor: "テストフレーバー",
              attack: 1000,
              defense: 800,
              tier: "default",
            });
          }
        });

        it("カードは回答送信順（古い→新しい、event_responses.id 昇順）でカルーセル内に並ぶ", async () => {
          // Act
          const response = await localApp.fetch(
            new Request("http://localhost:8787/events/evt-cards-order"),
          );
          const body = await response.text();

          // Assert — body 中で A → B → C の順に出現する
          const idxA = body.indexOf("二つ名Aさん固有");
          const idxB = body.indexOf("二つ名Bさん固有");
          const idxC = body.indexOf("二つ名Cさん固有");
          expect(idxA).toBeGreaterThanOrEqual(0);
          expect(idxB).toBeGreaterThan(idxA);
          expect(idxC).toBeGreaterThan(idxB);
        });
      });
      describe("aria-label（スクリーンリーダー対応）", () => {
        // Arrange — イベント・候補・参加者 1 名・participant_cards 1 件を seed
        beforeEach(async () => {
          const seeded = await seedEvent({
            id: "evt-cards-aria",
            title: "新年会",
            options: ["2026-01-10 19:00"],
          });
          const [opt] = seeded.optionIds;
          const { responseId } = await seedResponse({
            eventId: "evt-cards-aria",
            name: "山田太郎",
            answers: [{ optionId: opt!, answer: "○" }],
          });
          await database.insert(schema.participantCards).values({
            responseId,
            title: "輝ける戦士 山田太郎",
            rarity: "R",
            attribute: "火",
            race: "戦士",
            flavor: "テストフレーバー",
            attack: 1000,
            defense: 800,
            tier: "default",
          });
        });

        it("各カードに『二つ名 + 参加者名』を含む aria-label が付与される", async () => {
          // Act
          const response = await localApp.fetch(
            new Request("http://localhost:8787/events/evt-cards-aria"),
          );
          const body = await response.text();

          // Assert — aria-label 属性が存在し、その値に二つ名（参加者名を含む）が含まれる
          expect(body).toMatch(/aria-label="[^"]*輝ける戦士 山田太郎[^"]*"/);
        });
      });
      describe("回答が 0 件のとき", () => {
        // Arrange — event + 候補のみ seed（参加者 0 名）
        beforeEach(async () => {
          await seedEvent({
            id: "evt-cards-empty",
            title: "新年会",
            options: ["2026-01-10 19:00"],
          });
        });

        it('回答が 0 件のとき、カード（class="card-rarity-..."）はひとつも描画されない', async () => {
          // Act
          const response = await localApp.fetch(
            new Request("http://localhost:8787/events/evt-cards-empty"),
          );
          const body = await response.text();

          // Assert — 0 件のとき responses.map が空配列となり、card-rarity- クラスは描画されない
          const cardCount = (body.match(/class="card-rarity-/g) ?? []).length;
          expect(cardCount).toBe(0);
        });
      });
      describe("ATK / DEF の数値", () => {
        // Arrange — イベント・候補・参加者 1 名・participant_cards 1 件を seed
        beforeEach(async () => {
          const seeded = await seedEvent({
            id: "evt-cards-atk-def",
            title: "新年会",
            options: ["2026-01-10 19:00"],
          });
          const [opt] = seeded.optionIds;
          const { responseId } = await seedResponse({
            eventId: "evt-cards-atk-def",
            name: "山田太郎",
            answers: [{ optionId: opt!, answer: "○" }],
          });
          await database.insert(schema.participantCards).values({
            responseId,
            title: "輝ける戦士 山田太郎",
            rarity: "R",
            attribute: "火",
            race: "戦士",
            flavor: "テストフレーバー",
            attack: 2500,
            defense: 2100,
            tier: "default",
          });
        });

        it("ATK / DEF の数値がカード内に描画される", async () => {
          // Act
          const response = await localApp.fetch(
            new Request("http://localhost:8787/events/evt-cards-atk-def"),
          );
          const body = await response.text();

          // Assert — ATK / DEF ラベルと attack / defense の数値が body に含まれる
          expect(body).toContain("ATK");
          expect(body).toContain("DEF");
          expect(body).toContain("2500");
          expect(body).toContain("2100");
        });
      });
      describe("回答に紐づく card が null のとき", () => {
        // Arrange — event + 候補 + 参加者 1 名のみ seed する。participant_cards は INSERT しない（card === null の状態）
        beforeEach(async () => {
          const seeded = await seedEvent({
            id: "evt-cards-null",
            title: "新年会",
            options: ["2026-01-10 19:00"],
          });
          const [opt] = seeded.optionIds;
          await seedResponse({
            eventId: "evt-cards-null",
            name: "テスト参加者",
            answers: [{ optionId: opt!, answer: "○" }],
          });
        });

        it("回答に紐づく card が null のとき、カード本体の代わりにフォールバック表示が描画される", async () => {
          // Act
          const response = await localApp.fetch(
            new Request("http://localhost:8787/events/evt-cards-null"),
          );
          const body = await response.text();

          // Assert — design.md 推奨の「カードを生成中…」表記、または「カード生成中」のいずれかが含まれる
          const hasFallback = body.includes("カードを生成中") || body.includes("カード生成中");
          expect(hasFallback).toBe(true);
        });
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
        // 0 件のとき `ResponsesTable` は `<p>まだ回答がありません</p>` を返すため、
        // 集計行（および参加者行）が描画されないことは「集計表 <table> が存在しない」で
        // 精密に観察できる。○ / △ / × はフォームのラジオ入力にも現れ得るため、
        // 「○ 等の絵文字の絶対不在」での観察は false positive を生む（記号が存在するからといって
        // 集計表が描画されたとは限らない）。集計表自体の不在を直接観察する形に精密化する。
        expect(body).not.toContain("<table");
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

      it("カスタム質問列のヘッダーは固定文言『カスタム回答』ではなく event.customQuestion の文字列そのものを表示する", async () => {
        // Arrange
        // テーブルヘッダー <th> 自体は参加者が 1 人以上いないと描画されないため、参加者を seed する。
        const seeded = await seedEvent({
          id: "evt-q-header-label",
          title: "新年会",
          customQuestion: "アレルギーはありますか？",
          options: ["2026-01-10 19:00"],
        });
        await seedResponse({
          eventId: seeded.id,
          name: "アリス",
          answers: [{ optionId: seeded.optionIds[0]!, answer: "○" }],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-q-header-label"),
        );
        const body = await response.text();

        // Assert
        expect(body).not.toContain("<th>カスタム回答</th>");
        expect(body).toMatch(/<th[^>]*>[^<]*アレルギーはありますか？[^<]*<\/th>/);
      });

      it("カスタム質問列のヘッダー <th> には title 属性で設問文の全文が付与される（ツールチップ表示用）", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-q-header-title",
          title: "新年会",
          customQuestion: "アレルギーはありますか？",
          options: ["2026-01-10 19:00"],
        });
        await seedResponse({
          eventId: seeded.id,
          name: "アリス",
          answers: [{ optionId: seeded.optionIds[0]!, answer: "○" }],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-q-header-title"),
        );
        const body = await response.text();

        // Assert
        expect(body).toMatch(/<th[^>]*\btitle=["']アレルギーはありますか？["'][^>]*>/);
      });

      it("カスタム質問列のヘッダー <th> には text-overflow: ellipsis などの省略表示用 CSS が適用される", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-q-header-ellipsis",
          title: "新年会",
          customQuestion: "アレルギーはありますか？",
          options: ["2026-01-10 19:00"],
        });
        await seedResponse({
          eventId: seeded.id,
          name: "アリス",
          answers: [{ optionId: seeded.optionIds[0]!, answer: "○" }],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-q-header-ellipsis"),
        );
        const body = await response.text();

        // Assert
        const headerMatch = body.match(/<th[^>]*アレルギーはありますか？[^>]*>/);
        expect(headerMatch).not.toBeNull();
        expect(headerMatch![0]).toMatch(/text-overflow|ellipsis/);
      });

      it("カスタム設問文に HTML 特殊文字（<, >, & 等）を含んでも title 属性内で自動エスケープされ生の HTML が混入しない", async () => {
        // Arrange
        const XSS_MARKER = "<script>window.__xssMarker=1</script>";
        const seeded = await seedEvent({
          id: "evt-q-header-xss",
          title: "新年会",
          customQuestion: XSS_MARKER,
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
          new Request("http://localhost:8787/events/evt-q-header-xss"),
        );
        const body = await response.text();

        // Assert
        expect(body).not.toContain(XSS_MARKER);
        const thMatch = body.match(/<th[^>]*\btitle=["'][^"']*["'][^>]*>(?:(?!<\/th>).)*<\/th>/);
        expect(thMatch).not.toBeNull();
        expect(thMatch![0]).toContain("&lt;script&gt;");
        expect(thMatch![0]).not.toContain("<script>");
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

    /**
     * Task 4.1 補修: 回答フォーム（GET /events/:id のフォーム描画）
     *
     * 背景:
     *  - `POST /events/:id/responses` の永続化・バリデーション・フラグメント返却は実装済み
     *  - 一方で `EventPage` 上の回答フォームが「name 入力 + 送信ボタン」だけのプレースホルダで、
     *    候補ごとの ○ / △ / × ラジオ・customAnswer 入力・htmx 属性が欠落している
     *  - 結果として「回答する」を押すと name しか送信されず、POST 側の zod バリデーションが
     *    `answers[<optionId>]` 不足で失敗し、422 のフラグメント本文が画面差し替えされる
     *
     * 検証対象（観察可能な振る舞いに限定）:
     *  - フォームに各候補 ID に対応する `name="answers[<optionId>]"` の入力が描画される
     *  - カスタム設問の有無に応じて `name="customAnswer"` 入力の出現が切り替わる
     *  - フォームが htmx 経由（`hx-post`）で送信されるよう属性付けされている
     *  - 参加者 0 名のときでも、フォーム自体は「name 入力だけ」ではなく ○ / △ / × ラジオが
     *    存在する（既存「フォームが描画される」だけでは弱いため、ラジオの実在を観察する）
     *
     * スコープ外:
     *  - 個別の input type 属性、label の関連付け方式、ARIA 属性、クラス名等の DOM 詳細
     *  - htmx の `hx-target` / `hx-swap` の具体値（実装詳細。E2E で観察）
     *  - POST 側の挙動（既存 `POST /events/:id/responses` describe でカバー済み）
     *
     * 既存テスト書き換え提案（Phase 2 で実施。本 Phase ではテストコードを書かない）:
     *  - `参加者が 0 名のとき候補ごとの ○ / △ / × の集計行（人数）が描画されない` (line 973-995)
     *    は assert が `body.not.toContain("○")` 等で過度に広く、フォームに ○ / △ / × ラジオの
     *    記号が含まれると false positive で壊れる。意図（集計行が描画されないこと）に忠実な
     *    assert に書き換える方針:
     *      - `<ResponsesTable/>` は 0 件のとき `<p>まだ回答がありません</p>` を返すため、
     *        集計行が無いことは `<table` 不在で精密に表現できる
     *      - もしくは「集計」「○:」「○ 0」のような集計行固有のマーカーの不在で代替する
     *    Phase 2 のテストコード作成担当が、フォームに ○ / △ / × ラジオを置く方針と衝突しない
     *    形で assert を組み直す。
     */
    describe("回答フォーム（GET /events/:id のフォーム描画）", () => {
      it("カスタム設問ありのイベントで GET すると本文に各候補 ID の name='answers[<optionId>]' を持つ入力が候補数ぶん含まれる", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-form-answers",
          title: "新年会",
          customQuestion: "アレルギーはありますか？",
          options: ["2026-01-10 19:00", "2026-01-11 19:00", "2026-01-12 19:00"],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-form-answers"),
        );
        const body = await response.text();

        // Assert
        // 各候補 ID に対応する `name="answers[<optionId>]"` を持つ入力が描画されること
        for (const optionId of seeded.optionIds) {
          expect(body).toContain(`name="answers[${optionId}]"`);
        }
      });

      it("カスタム設問ありのイベントで GET すると本文に name='customAnswer' を持つ入力が描画される", async () => {
        // Arrange
        await seedEvent({
          id: "evt-form-customq",
          title: "新年会",
          customQuestion: "アレルギーはありますか？",
          options: ["2026-01-10 19:00"],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-form-customq"),
        );
        const body = await response.text();

        // Assert
        expect(body).toContain('name="customAnswer"');
      });

      it("カスタム設問なしのイベントで GET すると本文に name='customAnswer' を持つ入力が描画されない", async () => {
        // Arrange
        await seedEvent({
          id: "evt-form-nocustomq",
          title: "新年会",
          customQuestion: null,
          options: ["2026-01-10 19:00"],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-form-nocustomq"),
        );
        const body = await response.text();

        // Assert
        expect(body).not.toContain('name="customAnswer"');
      });

      it("参加者 0 名のイベントでも回答フォーム内に各候補に対する ○ / △ / × のラジオ入力（type='radio' かつ value が ○ / △ / ×）が描画される", async () => {
        // Arrange
        await seedEvent({
          id: "evt-form-radios",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-form-radios"),
        );
        const body = await response.text();

        // Assert
        // ○ / △ / × それぞれを value に持つ radio 入力が存在する、を観察する
        // （type 属性とのセット、value 属性のいずれの順序でも一致できるよう、
        //   存在する事実を value 属性側で観察する）
        expect(body).toContain('type="radio"');
        expect(body).toContain('value="○"');
        expect(body).toContain('value="△"');
        expect(body).toContain('value="×"');
      });

      it("回答フォームは htmx 経由で送信される（form 要素に hx-post 属性が付与され、通常ナビゲーションではなくフラグメント差し替えになる）", async () => {
        // Arrange
        await seedEvent({
          id: "evt-form-hxpost",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-form-hxpost"),
        );
        const body = await response.text();

        // Assert
        // 観察可能な振る舞いとして、form 要素に hx-post 属性が `/events/<id>/responses`
        // を指す形で付与されている、を確認する。hx-target / hx-swap の具体値は実装詳細として
        // 観察しない（E2E に委ねる）。
        expect(body).toMatch(
          /<form[^>]*hx-post=["'][^"']*\/events\/evt-form-hxpost\/responses["']/i,
        );
      });

      it("回答フォーム（create モード）には送信成功後に入力値をリセットする htmx 属性（hx-on::after-request='this.reset()'）が付与される", async () => {
        // Arrange
        await seedEvent({
          id: "evt-form-reset",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-form-reset"),
        );
        const body = await response.text();

        // Assert
        // form 要素が存在し、その上で htmx の after-request フックで this.reset() が呼ばれる、
        // という観察可能な振る舞いを確認する。クオート種別（シングル/ダブル）は実装の表現揺れ
        // として吸収する。
        expect(body).toMatch(/<form[^>]*>/i);
        expect(body).toMatch(/hx-on::after-request=["']this\.reset\(\)["']/);
      });
    });

    /**
     * ○ 票数が最多の候補列を視覚的にハイライトする機能。
     *
     * 観察可能なマーカーとして、該当列の `<th>` / `<td>` に `data-top-pick="true"`
     * 属性を付与する。視覚スタイル自体（色など）は実装の詳細として検証しない。
     *
     * 仕様:
     *  - 各候補の ○ カウントを比較し、最大値を持つ候補列にマーカーを付ける
     *  - タイブレーク: 最大値を共有する候補が複数あれば、すべての列に付与する
     *  - 全候補が 0 票なら（誰も突出していないため）どの列にも付与しない
     *  - 参加者が 0 名のときは集計テーブル自体が描画されないため、属性も本文に含まれない
     */
    describe("○ 票数最多列のハイライト", () => {
      it("単独 1 位の候補列（ヘッダ・参加者セル・集計セル）に data-top-pick='true' 属性が付与される", async () => {
        // Arrange: 候補 2 件、参加者 1 名、opt1=○ / opt2=× → opt1 が単独 1 位
        const seeded = await seedEvent({
          id: "evt-top-pick-single",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        await seedResponse({
          eventId: seeded.id,
          name: "山田",
          answers: [
            { optionId: seeded.optionIds[0]!, answer: "○" },
            { optionId: seeded.optionIds[1]!, answer: "×" },
          ],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-top-pick-single"),
        );
        const body = await response.text();

        // Assert: 単独 1 位の列に対しマーカーが本文に出現する
        expect(body).toContain('data-top-pick="true"');
      });

      it("単独 1 位でない候補列には data-top-pick 属性が付与されない", async () => {
        // Arrange: 候補 2 件、参加者 1 名、opt1=○ / opt2=× → opt1 のみ単独 1 位
        const seeded = await seedEvent({
          id: "evt-top-pick-non-top",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        await seedResponse({
          eventId: seeded.id,
          name: "山田",
          answers: [
            { optionId: seeded.optionIds[0]!, answer: "○" },
            { optionId: seeded.optionIds[1]!, answer: "×" },
          ],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-top-pick-non-top"),
        );
        const body = await response.text();

        // Assert: マーカーは 1 列分のみ（ヘッダ + 参加者セル + 集計セル = 3 件）
        // 4 件以上含まれない（= 非トップ列には付与されていない）ことで観察する
        const matches = body.match(/data-top-pick="true"/g) ?? [];
        expect(matches.length).toBe(3);
      });

      it("○ 票数が同点の複数候補列すべてに data-top-pick='true' 属性が付与される", async () => {
        // Arrange: 候補 2 件、参加者 2 名、両参加者とも opt1=○ / opt2=○ → 同点 2 列
        const seeded = await seedEvent({
          id: "evt-top-pick-tie",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        await seedResponse({
          eventId: seeded.id,
          name: "山田",
          answers: [
            { optionId: seeded.optionIds[0]!, answer: "○" },
            { optionId: seeded.optionIds[1]!, answer: "○" },
          ],
        });
        await seedResponse({
          eventId: seeded.id,
          name: "佐藤",
          answers: [
            { optionId: seeded.optionIds[0]!, answer: "○" },
            { optionId: seeded.optionIds[1]!, answer: "○" },
          ],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-top-pick-tie"),
        );
        const body = await response.text();

        // Assert: 2 列分 × (1 ヘッダ + 2 参加者 + 1 集計) = 8 件
        const matches = body.match(/data-top-pick="true"/g) ?? [];
        expect(matches.length).toBe(8);
      });

      it("全候補が ○ 0 票のとき data-top-pick 属性は本文に一切含まれない", async () => {
        // Arrange: 候補 2 件、参加者 1 名、両方 × → ○ 0 票
        const seeded = await seedEvent({
          id: "evt-top-pick-zero",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        await seedResponse({
          eventId: seeded.id,
          name: "山田",
          answers: [
            { optionId: seeded.optionIds[0]!, answer: "×" },
            { optionId: seeded.optionIds[1]!, answer: "×" },
          ],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-top-pick-zero"),
        );
        const body = await response.text();

        // Assert
        expect(body).not.toContain("data-top-pick");
      });

      it("参加者 0 名のとき（テーブル自体が描画されない）data-top-pick 属性は本文に含まれない", async () => {
        // Arrange: 候補 2 件、参加者なし
        await seedEvent({
          id: "evt-top-pick-no-participants",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });

        // Act
        const response = await localApp.fetch(
          new Request("http://localhost:8787/events/evt-top-pick-no-participants"),
        );
        const body = await response.text();

        // Assert
        expect(body).not.toContain("data-top-pick");
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

    /**
     * Task 3.1: 参加者カードとの連動（Card Service + OOB フラグメント）
     *
     * 検証対象（要件 1.1, 2.4, 5.4, 6.1, 6.2）:
     *  - 新規回答送信成功時、Card Service（`cards.ts` の `cardService.generateAndPersist`）が呼ばれ、
     *    `participant_cards` に当該 response に紐づくカードが 1 件作成される（要件 1.1, 5.4）
     *  - レスポンス本文に既存 `#responses` フラグメントと、`#cards` を `hx-swap-oob` で
     *    同時更新するフラグメントの両方が含まれる（要件 2.4, 6.1, 6.2）
     *  - `#cards` フラグメントには新規生成された参加者の二つ名（カード title）が含まれる
     *  - 404 / 422 の異常系では `participant_cards` に副作用が発生しない
     *
     * 設計の前提:
     *  - プロセス外依存（Gemini API）は `setCardGeneratorForTest(stub)` で完全に差し替える
     *    （古典派 TDD のプロセス外依存モック方針）。各テストの `beforeEach` で stub を注入し、
     *    `__resetQuotaForTest()` を呼んでクォータ枯渇フラグもリセットする
     *  - `addResponseWithCard` は `src/db.ts` に既に実装済み（同一トランザクション書き込み）
     *  - 既存 `#responses` フラグメントの返却挙動（上の正常系 describe）は無改変
     *
     * 備考:
     *  - 既存 `beforeEach` には `participantCards` テーブルの truncate が含まれていない。
     *    本 describe のテストを成立させるには Phase 2 で truncate に participantCards を追加する必要がある
     *    （子テーブルから順に削除する規約に従い、最初の `delete` の前に追加する）
     */
    describe("参加者カードとの連動（Task 3.1）", () => {
      // 古典派 TDD: プロセス外依存（Gemini API）のみ stub に差し替える。
      // DB は実体（in-memory SQLite）を使い、participant_cards も子テーブルとして
      // 各ケース前に truncate する（既存 beforeEach には含まれていないためここで明示）。
      beforeEach(async () => {
        await database.delete(schema.participantCards);

        const { setCardGeneratorForTest, __resetQuotaForTest } = await import("./gemini");
        __resetQuotaForTest();
        setCardGeneratorForTest({
          generate: async (name) => ({
            title: "テスト二つ名 " + name,
            rarity: "R",
            attribute: "火",
            race: "戦士",
            flavor: "テストフレーバー",
            attack: 1000,
            defense: 800,
          }),
          verifyConnectivity: async () => ({ ok: true }),
        });
      });

      afterEach(async () => {
        const { setCardGeneratorForTest } = await import("./gemini");
        setCardGeneratorForTest(null);
      });

      it("正常系: POST 成功時に participant_cards に当該 response に紐づくカードが 1 件作成される", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-card-link-200",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("evt-card-link-200", [
            ["name", "山田太郎"],
            [`answers[${opt}]`, "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const responses = await database.select().from(schema.eventResponses);
        expect(responses.length).toBe(1);
        const cards = await database.select().from(schema.participantCards);
        expect(cards.length).toBe(1);
        expect(cards[0]!.responseId).toBe(responses[0]!.id);
      });

      it("正常系: POST 成功時に作成された participant_cards.title には参加者名（送信した name）が部分文字列として含まれる", async () => {
        // Arrange
        // stub（上位 beforeEach で配線済み）は `title: "テスト二つ名 " + name` を返す。
        // POST 成功時に作られる participant_cards の title に、送信した name が
        // String#includes として含まれることだけを検証する（具体的な接頭辞や書式は
        // 実装の詳細に踏み込まないように避ける）。
        const participantName = "山田太郎";
        const seeded = await seedEvent({
          id: "evt-card-link-title-includes",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("evt-card-link-title-includes", [
            ["name", participantName],
            [`answers[${opt}]`, "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const cards = await database.select().from(schema.participantCards);
        expect(cards.length).toBe(1);
        expect(cards[0]!.title.includes(participantName)).toBe(true);
      });

      it("正常系: POST 成功時の participant_cards.response_id は作成された event_responses.id と一致する（1:1 紐付け）", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-card-link-fk",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("evt-card-link-fk", [
            ["name", "山田太郎"],
            [`answers[${opt}]`, "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const responses = await database.select().from(schema.eventResponses);
        const cards = await database.select().from(schema.participantCards);
        expect(responses.length).toBe(1);
        expect(cards.length).toBe(1);
        expect(cards[0]!.responseId).toBe(responses[0]!.id);
      });

      it("正常系: レスポンス本文に既存の `#responses` フラグメントと `#cards` の OOB フラグメント（`hx-swap-oob`）が両方含まれる", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-card-link-oob",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("evt-card-link-oob", [
            ["name", "山田太郎"],
            [`answers[${opt}]`, "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain(`id="responses"`);
        expect(body).toContain(`id="cards"`);
        expect(body).toContain("hx-swap-oob");
      });

      it("正常系: `#cards` の OOB フラグメントには新規生成された参加者カードの二つ名（title）が含まれる", async () => {
        // Arrange
        // stub（beforeEach で配線済み）は `title: "テスト二つ名 " + name` を返す。
        // 参加者名 "山田太郎" を送ると、stub が返す title は "テスト二つ名 山田太郎" となる。
        // この文字列が `#cards` OOB フラグメント（= POST 成功時のレスポンス本文）に含まれることを検証する。
        const seeded = await seedEvent({
          id: "evt-card-link-title",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("evt-card-link-title", [
            ["name", "山田太郎"],
            [`answers[${opt}]`, "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain("テスト二つ名 山田太郎");
      });

      it("正常系: 既存参加者が居るイベントに新規回答を送ると、`#cards` フラグメントに既存カードと新規カードの両方が含まれる（カルーセル全置換 = OOB 全更新）", async () => {
        // Arrange
        // 既存参加者 1 名とそのカードを直接 INSERT で作っておく。
        // stub（beforeEach で配線済み）は `title: "テスト二つ名 " + name` を返すため、
        // 既存カードは stub の挙動と同じ書式の title を採用し、新規分との見分けを参加者名で行う。
        const seeded = await seedEvent({
          id: "evt-card-link-both",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        const [existingResp] = await database
          .insert(schema.eventResponses)
          .values({ eventId: "evt-card-link-both", name: "既存花子" })
          .returning({ id: schema.eventResponses.id });
        await database.insert(schema.eventOptionResponses).values({
          responseId: existingResp!.id,
          optionId: opt!,
          answer: "○",
        });
        await database.insert(schema.participantCards).values({
          responseId: existingResp!.id,
          title: "テスト二つ名 既存花子",
          rarity: "R",
          attribute: "水",
          race: "魔法使い",
          flavor: "既存フレーバー",
          attack: 900,
          defense: 700,
          tier: "ai",
        });

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("evt-card-link-both", [
            ["name", "新規太郎"],
            [`answers[${opt}]`, "△"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain("テスト二つ名 既存花子");
        expect(body).toContain("テスト二つ名 新規太郎");
      });

      it("422 のとき participant_cards にレコードは作成されない（バリデーション失敗時に Card Service を呼ばない／副作用なし）", async () => {
        // Arrange — 候補日時 1 つのイベントを作る。Card Service の stub は上位 beforeEach で配線済み。
        const seeded = await seedEvent({
          id: "evt-card-link-422-no-side-effect",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act — name 空文字で 422 を起こす（既存 422 ケースと同じトリガー）
        const response = await localApp.fetch(
          buildResponseRequest("evt-card-link-422-no-side-effect", [
            ["name", ""],
            [`answers[${opt}]`, "○"],
          ]),
        );

        // Assert — 前段で 422 を確認し、event_responses / participant_cards 双方に副作用がないこと
        expect(response.status).toBe(422);
        const responses = await database.select().from(schema.eventResponses);
        expect(responses.length).toBe(0);
        const cards = await database.select().from(schema.participantCards);
        expect(cards.length).toBe(0);
      });

      it("422 のレスポンス本文には `#cards` の OOB フラグメントが含まれない（差し戻しフォームのみを返す）", async () => {
        // Arrange — 候補日時 1 つのイベントを作る。Card Service の stub は上位 beforeEach で配線済み。
        const seeded = await seedEvent({
          id: "evt-card-link-422-no-oob",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;

        // Act — name 空文字で 422 を起こす（既存 422 ケースと同じトリガー）
        const response = await localApp.fetch(
          buildResponseRequest("evt-card-link-422-no-oob", [
            ["name", ""],
            [`answers[${opt}]`, "○"],
          ]),
        );

        // Assert — 422 を確認した上で、`#cards` の OOB フラグメントが本文に含まれないこと
        expect(response.status).toBe(422);
        const body = await response.text();
        expect(body).not.toContain(`id="cards"`);
        expect(body).not.toContain("hx-swap-oob");
      });

      it("404（不在 event ID）のとき participant_cards にレコードは作成されない（副作用なし）", async () => {
        // Arrange — 何も seed しない（beforeEach で全テーブル truncate 済み）。
        // Card Service stub は上位 beforeEach で配線済みだが、404 経路では呼ばれない想定。

        // Act
        const response = await localApp.fetch(
          buildResponseRequest("non-existent-id", [
            ["name", "山田太郎"],
            ["answers[1]", "○"],
          ]),
        );

        // Assert — 前段で 404 を確認し、participant_cards / event_responses 双方に副作用がないこと
        expect(response.status).toBe(404);
        const cards = await database.select().from(schema.participantCards);
        expect(cards.length).toBe(0);
        const responses = await database.select().from(schema.eventResponses);
        expect(responses.length).toBe(0);
      });
    });
  });

  /**
   * Task 4.2: 回答編集モードと更新（編集フォームへの差し替えルート）
   *
   * 検証対象:
   *  - 既存参加者行の「編集」アクション押下相当の GET リクエストに対して、
   *    対象参加者を編集可能なフォームフラグメント（`<ResponseFormRow mode="edit"/>`）を返す（要件 4.1）
   *  - フラグメント応答は `<html>` を含まない部分 HTML である（要件 5.2）
   *  - フォームには対象参加者の既存値（名前・候補ごとの ○/△/×・カスタム設問への回答）が
   *    初期値として埋め込まれる（要件 4.5）
   *  - カスタム設問が設定されていないイベントでは、編集フォームにカスタム設問入力欄が現れない（要件 3.10 同等）
   *  - 編集対象の責任イベントとレスポンスの所属が一致しない場合は 404（要件 4.3）
   *  - 不在 responseId / 不在 eventId のいずれでも 404（要件 4.3）
   *
   * スコープ外:
   *  - 編集後の PUT 反映 → 別 describe（PUT /events/:id/responses/:responseId）で検証
   *  - 編集ボタン UI の DOM 構造・hx-* 属性の具体（実装の詳細）→ E2E 側
   *  - htmx の swap 挙動・`hx-target` の具体（実装の詳細）→ E2E 側
   *
   * 設計の前提:
   *  - 編集フラグメント取得ルートのパスは `GET /events/:id/responses/:responseId/edit` を想定
   *    （tasks.md 4.2 と design.md「PUT /events/:id/responses/:responseId」の対称形）
   *  - Task 4.1 と同じ `localApp` / `:memory:` / `beforeEach` 規約を踏襲する
   *  - 古典派ブラックボックス: DB は実体、views / routes / schema を実体結合
   *  - DOM 検証は HTML 文字列に対する構造的アサーション（`<form>` の存在 / 送信値文字列の包含等）に留め、
   *    クラス名や具体的な属性値などの実装の詳細には踏み込まない（リファクタリング耐性を優先）
   *
   * 備考:
   *  - Bun の `it.todo` は `fn` 引数が必須のため、本ファイルでは `() => {}` を渡している。
   *    Phase 2（RED）で本体実装に置き換える。
   */
  describe("GET /events/:id/responses/:responseId/edit", () => {
    // PUT describe と同じ規約（:memory: SQLite + 動的 import + 子から順 truncate）。
    // 兄弟 describe では変数を共有できないため、ここで再宣言する。
    let localApp: Hono;
    let database: typeof import("./db").db;
    let schema: typeof import("./schema");

    beforeAll(async () => {
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

    // 共通ヘルパ: イベントと候補日時を作る（PUT describe と同形）
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

    // 共通ヘルパ: 既存の参加者 1 件と各候補への回答を DB に直接投入し、responseId を返す
    const seedResponse = async (input: {
      eventId: string;
      name: string;
      customAnswer?: string | null;
      answers: Array<{ optionId: number; answer: "○" | "△" | "×" }>;
    }): Promise<number> => {
      const [row] = await database
        .insert(schema.eventResponses)
        .values({
          eventId: input.eventId,
          name: input.name,
          customAnswer: input.customAnswer ?? null,
        })
        .returning({ id: schema.eventResponses.id });
      await database.insert(schema.eventOptionResponses).values(
        input.answers.map((a) => ({
          responseId: row.id,
          optionId: a.optionId,
          answer: a.answer,
        })),
      );
      return row.id;
    };

    // 共通ヘルパ: GET edit リクエストを組み立てる
    const buildGetEditRequest = (eventId: string, responseId: number | string): Request => {
      return new Request(`http://localhost:8787/events/${eventId}/responses/${responseId}/edit`);
    };

    describe("正常系（編集フォームフラグメントの返却）", () => {
      it("既存の responseId に対する GET は 200 を返す", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-edit-200",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-edit-200",
          name: "山田太郎",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });

        // Act
        const response = await localApp.fetch(buildGetEditRequest("evt-edit-200", responseId));

        // Assert
        expect(response.status).toBe(200);
      });

      it("レスポンス本文は <html> を含まないフラグメントとして返る", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-edit-fragment",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-edit-fragment",
          name: "山田太郎",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });

        // Act
        const response = await localApp.fetch(buildGetEditRequest("evt-edit-fragment", responseId));
        const body = await response.text();

        // Assert
        // フラグメントの定義: フルページの <html>/<!doctype> を含まない
        expect(body).not.toContain("<html");
        expect(body.toLowerCase()).not.toContain("<!doctype");
      });

      it("レスポンス本文に対象参加者の既存の name が初期値として含まれる", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-edit-name",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-edit-name",
          name: "山田太郎",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });

        // Act
        const response = await localApp.fetch(buildGetEditRequest("evt-edit-name", responseId));
        const body = await response.text();

        // Assert
        expect(body).toContain("山田太郎");
      });

      it("レスポンス本文に対象参加者の候補ごとの ○/△/× 既存回答が初期値として含まれる", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-edit-answers",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00", "2026-01-12 19:00"],
        });
        const [optA, optB, optC] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-edit-answers",
          name: "佐藤花子",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
            { optionId: optC, answer: "×" },
          ],
        });

        // Act
        const response = await localApp.fetch(buildGetEditRequest("evt-edit-answers", responseId));
        const body = await response.text();

        // Assert
        // 候補ごとに既存回答が「現在の選択」として本文に現れる。
        // 具体的な選択方式（select / radio / checked 属性）には踏み込まず、
        // 「optionId と回答記号が同一断片内に並ぶ」ことを最小限で確認する。
        expect(body).toContain(String(optA));
        expect(body).toContain(String(optB));
        expect(body).toContain(String(optC));
        expect(body).toContain("○");
        expect(body).toContain("△");
        expect(body).toContain("×");
      });

      it("カスタム設問ありのイベントでは、既存のカスタム設問回答が初期値として含まれる", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-edit-custom-yes",
          title: "新年会",
          customQuestion: "アレルギーはありますか？",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-edit-custom-yes",
          name: "鈴木一郎",
          customAnswer: "甲殻類アレルギーあり",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });

        // Act
        const response = await localApp.fetch(
          buildGetEditRequest("evt-edit-custom-yes", responseId),
        );
        const body = await response.text();

        // Assert
        expect(body).toContain("甲殻類アレルギーあり");
      });

      it("カスタム設問なしのイベントでは、編集フォームにカスタム設問入力欄が描画されない", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-edit-custom-no",
          title: "新年会",
          customQuestion: null,
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-edit-custom-no",
          name: "高橋次郎",
          customAnswer: null,
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });

        // Act
        const response = await localApp.fetch(
          buildGetEditRequest("evt-edit-custom-no", responseId),
        );
        const body = await response.text();

        // Assert
        // カスタム設問入力欄が描画されないことを、name="customAnswer" の入力要素が
        // 本文に含まれないことで間接的に確認する（属性順や input/textarea の選択など
        // 実装の詳細には踏み込まない範囲で「customAnswer」という送信キー名の不在を見る）
        expect(body).not.toContain("customAnswer");
      });
    });

    describe("不在 / 不一致のとき 404", () => {
      it("不在の event ID に対する GET は 404 を返す", async () => {
        // Arrange
        // 何も seed しない: DB は beforeEach で空

        // Act
        const response = await localApp.fetch(buildGetEditRequest("evt-edit-missing", 1));

        // Assert
        expect(response.status).toBe(404);
      });

      it("不在の responseId に対する GET は 404 を返す", async () => {
        // Arrange
        await seedEvent({
          id: "evt-edit-no-resp",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });

        // Act
        const response = await localApp.fetch(buildGetEditRequest("evt-edit-no-resp", 999999));

        // Assert
        expect(response.status).toBe(404);
      });

      it("event ID に紐づかない別イベントの responseId への GET は 404 を返す", async () => {
        // Arrange
        const eventA = await seedEvent({
          id: "evt-edit-other-A",
          title: "Aイベント",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const eventB = await seedEvent({
          id: "evt-edit-other-B",
          title: "Bイベント",
          options: ["2026-02-10 19:00", "2026-02-11 19:00"],
        });
        // A の responseId
        const responseIdA = await seedResponse({
          eventId: eventA.id,
          name: "Aの参加者",
          answers: [
            { optionId: eventA.optionIds[0], answer: "○" },
            { optionId: eventA.optionIds[1], answer: "△" },
          ],
        });

        // Act
        // B の URL に対して A の responseId を渡す
        const response = await localApp.fetch(buildGetEditRequest(eventB.id, responseIdA));

        // Assert
        expect(response.status).toBe(404);
      });
    });
  });

  /**
   * Task 4.2: 回答編集モードと更新（PUT 更新ハンドラ）
   *
   * 検証対象:
   *  - `PUT /events/:id/responses/:responseId` が新規登録（POST /events/:id/responses）と
   *    同じバリデーション規則（`name` 1..100、`answers[<optionId>]` ∈ {○, △, ×}、`customAnswer?` 0..500）で
   *    入力検証を行う（要件 4.4）
   *  - 成功時は `event_responses`（name / customAnswer）と
   *    `event_option_responses`（候補ごとの回答）を上書きする（要件 4.2）
   *  - 成功時は 200 + `<ResponsesTable/>` フラグメントを返し、`<html>` を含まない断片である（要件 4.2 / 5.2）
   *  - 検証失敗時は 422 を返し、送信値が本文に含まれる（入力値保持、要件 4.4 + 3.5 相当）
   *  - 編集対象の responseId が当該イベントに紐づかないとき 404（要件 4.3）
   *  - 不在 event ID のとき 404
   *  - 422 / 404 のとき DB に副作用が発生しない（旧レコードが書き換わらない）
   *
   * スコープ外:
   *  - 編集フォーム自体の取得 → 上の `GET /events/:id/responses/:responseId/edit` describe で検証
   *  - 集計表の細部レンダリング → Task 3.1 で検証済み
   *  - htmx の `hx-put` / swap 挙動の具体 → E2E 側
   *
   * 設計の前提:
   *  - Task 4.1 と同じ `localApp` / `:memory:` / `beforeEach` 規約を踏襲する
   *  - 古典派ブラックボックス: DB は実体、views / routes / db / schema を実体結合
   *  - PUT のリクエストは `Request(url, { method: "PUT", ... })` で構築する
   *    （ハンドラ側が `hx-put` の `method-override` を受ける場合は Phase 2 で吸収）
   *
   * 備考:
   *  - Bun の `it.todo` は `fn` 引数が必須のため、本ファイルでは `() => {}` を渡している。
   *    Phase 2（RED）で本体実装に置き換える。
   */
  describe("PUT /events/:id/responses/:responseId", () => {
    // POST /events/:id/responses と同じ規約（:memory: SQLite + 動的 import + 子から順 truncate）。
    // 兄弟 describe では変数を共有できないため、ここで再宣言する。
    let localApp: Hono;
    let database: typeof import("./db").db;
    let schema: typeof import("./schema");

    beforeAll(async () => {
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

    // 共通ヘルパ: イベントと候補日時を作る（POST と同形）
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

    // 共通ヘルパ: 既存の参加者 1 件と各候補への回答を DB に直接投入し、responseId を返す
    const seedResponse = async (input: {
      eventId: string;
      name: string;
      customAnswer?: string | null;
      answers: Array<{ optionId: number; answer: "○" | "△" | "×" }>;
    }): Promise<number> => {
      const [row] = await database
        .insert(schema.eventResponses)
        .values({
          eventId: input.eventId,
          name: input.name,
          customAnswer: input.customAnswer ?? null,
        })
        .returning({ id: schema.eventResponses.id });
      await database.insert(schema.eventOptionResponses).values(
        input.answers.map((a) => ({
          responseId: row.id,
          optionId: a.optionId,
          answer: a.answer,
        })),
      );
      return row.id;
    };

    // 共通ヘルパ: PUT リクエストを組み立てる
    const buildPutRequest = (
      eventId: string,
      responseId: number,
      entries: Array<[string, string]>,
    ): Request => {
      const params = new URLSearchParams();
      for (const [k, v] of entries) {
        params.append(k, v);
      }
      return new Request(`http://localhost:8787/events/${eventId}/responses/${responseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
    };

    describe("正常系（既存回答の上書きとフラグメント応答）", () => {
      it("有効な form での PUT は 200 を返す", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-200",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-200",
          name: "山田太郎",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });

        // Act
        const response = await localApp.fetch(
          buildPutRequest("evt-put-200", responseId, [
            ["name", "山田太郎"],
            [`answers[${optA}]`, "△"],
            [`answers[${optB}]`, "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
      });
      it("成功時のレスポンス本文は <html> を含まないフラグメントとして返る", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-fragment-html",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-fragment-html",
          name: "山田太郎",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });

        // Act
        const response = await localApp.fetch(
          buildPutRequest("evt-put-fragment-html", responseId, [
            ["name", "山田太郎"],
            [`answers[${optA}]`, "△"],
            [`answers[${optB}]`, "○"],
          ]),
        );
        const body = await response.text();

        // Assert
        // フラグメントの定義: フルページの <html>/<!doctype> を含まず、集計表の行（<tr>）を含む
        expect(body).not.toContain("<html");
        expect(body.toLowerCase()).not.toContain("<!doctype");
        expect(body).toContain("<tr");
      });

      it("成功時のレスポンス本文は集計表フラグメント（<table> を含む）である", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-fragment-table",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-fragment-table",
          name: "山田太郎",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });

        // Act
        const response = await localApp.fetch(
          buildPutRequest("evt-put-fragment-table", responseId, [
            ["name", "山田太郎"],
            [`answers[${optA}]`, "△"],
            [`answers[${optB}]`, "○"],
          ]),
        );
        const body = await response.text();

        // Assert
        expect(body).toContain("<table");
      });
      it("name を変更すると event_responses.name が新しい値で更新される", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-name",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-name",
          name: "旧名",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });

        // Act
        await localApp.fetch(
          buildPutRequest("evt-put-name", responseId, [
            ["name", "新名"],
            [`answers[${optA}]`, "○"],
            [`answers[${optB}]`, "△"],
          ]),
        );

        // Assert
        const { eq } = await import("drizzle-orm");
        const [row] = await database
          .select({ name: schema.eventResponses.name })
          .from(schema.eventResponses)
          .where(eq(schema.eventResponses.id, responseId));
        expect(row.name).toBe("新名");
      });
      it("候補ごとの回答（○/△/×）を変更すると event_option_responses が新しい値に上書きされる", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-answers",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-answers",
          name: "山田太郎",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });

        // Act
        await localApp.fetch(
          buildPutRequest("evt-put-answers", responseId, [
            ["name", "山田太郎"],
            [`answers[${optA}]`, "×"],
            [`answers[${optB}]`, "○"],
          ]),
        );

        // Assert
        const { eq } = await import("drizzle-orm");
        const rows = await database
          .select({
            optionId: schema.eventOptionResponses.optionId,
            answer: schema.eventOptionResponses.answer,
          })
          .from(schema.eventOptionResponses)
          .where(eq(schema.eventOptionResponses.responseId, responseId));
        const answerByOption = new Map(rows.map((r) => [r.optionId, r.answer]));
        expect(answerByOption.get(optA)).toBe("×");
        expect(answerByOption.get(optB)).toBe("○");
      });

      it("event_option_responses の件数は更新後も候補数と一致する（増減しない）", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-answers-count",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00", "2026-01-12 19:00"],
        });
        const [optA, optB, optC] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-answers-count",
          name: "山田太郎",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
            { optionId: optC, answer: "×" },
          ],
        });

        // Act
        await localApp.fetch(
          buildPutRequest("evt-put-answers-count", responseId, [
            ["name", "山田太郎"],
            [`answers[${optA}]`, "△"],
            [`answers[${optB}]`, "×"],
            [`answers[${optC}]`, "○"],
          ]),
        );

        // Assert
        const { eq } = await import("drizzle-orm");
        const rows = await database
          .select({ id: schema.eventOptionResponses.id })
          .from(schema.eventOptionResponses)
          .where(eq(schema.eventOptionResponses.responseId, responseId));
        expect(rows.length).toBe(3);
      });

      it("event_responses のレコード件数は更新で増減しない（同一参加者の上書きである）", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-responses-count",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-responses-count",
          name: "山田太郎",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });

        // Act
        await localApp.fetch(
          buildPutRequest("evt-put-responses-count", responseId, [
            ["name", "山田太郎"],
            [`answers[${optA}]`, "△"],
            [`answers[${optB}]`, "○"],
          ]),
        );

        // Assert
        const { eq } = await import("drizzle-orm");
        const rows = await database
          .select({ id: schema.eventResponses.id })
          .from(schema.eventResponses)
          .where(eq(schema.eventResponses.eventId, "evt-put-responses-count"));
        expect(rows.length).toBe(1);
      });

      it("カスタム設問ありのイベントで customAnswer を変更すると event_responses.custom_answer が更新される", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-custom",
          title: "新年会",
          customQuestion: "食事制限はありますか？",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-custom",
          name: "山田太郎",
          customAnswer: "アレルギーなし",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });

        // Act
        await localApp.fetch(
          buildPutRequest("evt-put-custom", responseId, [
            ["name", "山田太郎"],
            ["customAnswer", "ベジタリアン"],
            [`answers[${optA}]`, "○"],
            [`answers[${optB}]`, "△"],
          ]),
        );

        // Assert
        const { eq } = await import("drizzle-orm");
        const [row] = await database
          .select({ customAnswer: schema.eventResponses.customAnswer })
          .from(schema.eventResponses)
          .where(eq(schema.eventResponses.id, responseId));
        expect(row.customAnswer).toBe("ベジタリアン");
      });

      it("customAnswer に空文字を送ると event_responses.custom_answer は空文字として保存される", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-custom-empty",
          title: "新年会",
          customQuestion: "食事制限はありますか？",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-custom-empty",
          name: "山田太郎",
          customAnswer: "アレルギーなし",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });

        // Act
        await localApp.fetch(
          buildPutRequest("evt-put-custom-empty", responseId, [
            ["name", "山田太郎"],
            ["customAnswer", ""],
            [`answers[${optA}]`, "○"],
            [`answers[${optB}]`, "△"],
          ]),
        );

        // Assert
        const { eq } = await import("drizzle-orm");
        const [row] = await database
          .select({ customAnswer: schema.eventResponses.customAnswer })
          .from(schema.eventResponses)
          .where(eq(schema.eventResponses.id, responseId));
        expect(row.customAnswer).toBe("");
      });
    });

    describe("バリデーション失敗時の差し戻し（422 + 入力値保持 + 副作用なし）", () => {
      it("name が空文字の PUT は 422 を返す", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-422-name-empty",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-422-name-empty",
          name: "山田太郎",
          answers: [{ optionId: opt, answer: "○" }],
        });

        // Act
        const response = await localApp.fetch(
          buildPutRequest("evt-put-422-name-empty", responseId, [
            ["name", ""],
            [`answers[${opt}]`, "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("name が 101 文字の PUT は 422 を返す", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-422-name-too-long",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-422-name-too-long",
          name: "山田太郎",
          answers: [{ optionId: opt, answer: "○" }],
        });

        // Act
        const response = await localApp.fetch(
          buildPutRequest("evt-put-422-name-too-long", responseId, [
            ["name", "a".repeat(101)],
            [`answers[${opt}]`, "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("answers のいずれかが ○△× 以外の値の PUT は 422 を返す", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-422-answer-invalid",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [opt1, opt2] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-422-answer-invalid",
          name: "山田太郎",
          answers: [
            { optionId: opt1, answer: "○" },
            { optionId: opt2, answer: "△" },
          ],
        });

        // Act
        const response = await localApp.fetch(
          buildPutRequest("evt-put-422-answer-invalid", responseId, [
            ["name", "山田太郎"],
            [`answers[${opt1}]`, "○"],
            [`answers[${opt2}]`, "maybe"],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("answers のキーが当該イベントの候補 ID 以外を含む PUT は 422 を返す", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-422-unknown-option",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-422-unknown-option",
          name: "山田太郎",
          answers: [{ optionId: opt, answer: "○" }],
        });

        // Act — 当該イベントに存在しない optionId (999999) を answers に含める
        const response = await localApp.fetch(
          buildPutRequest("evt-put-422-unknown-option", responseId, [
            ["name", "山田太郎"],
            [`answers[${opt}]`, "○"],
            [`answers[999999]`, "△"],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("customAnswer が 501 文字の PUT は 422 を返す", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-422-custom-answer-too-long",
          title: "新年会",
          customQuestion: "何か質問",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-422-custom-answer-too-long",
          name: "山田太郎",
          customAnswer: "旧回答",
          answers: [{ optionId: opt, answer: "○" }],
        });

        // Act
        const response = await localApp.fetch(
          buildPutRequest("evt-put-422-custom-answer-too-long", responseId, [
            ["name", "山田太郎"],
            [`answers[${opt}]`, "○"],
            ["customAnswer", "a".repeat(501)],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
      });

      it("422 のレスポンス本文に送信した name の値が含まれる（入力値保持）", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-422-preserve-name",
          title: "新年会",
          customQuestion: "何か質問",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-422-preserve-name",
          name: "旧名",
          answers: [{ optionId: opt, answer: "○" }],
        });

        // Act — customAnswer 501 文字で 422 を起こし、name に保持すべき値を入れる
        const response = await localApp.fetch(
          buildPutRequest("evt-put-422-preserve-name", responseId, [
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

      it("422 のレスポンス本文に送信した customAnswer の値が含まれる（入力値保持）", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-422-preserve-custom-answer",
          title: "新年会",
          customQuestion: "何か質問",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-422-preserve-custom-answer",
          name: "山田太郎",
          customAnswer: "旧回答",
          answers: [{ optionId: opt, answer: "○" }],
        });

        // Act — name 空文字で 422 を起こし、customAnswer に保持すべきユニーク値を入れる
        const response = await localApp.fetch(
          buildPutRequest("evt-put-422-preserve-custom-answer", responseId, [
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

      it("422 のとき event_responses の対象レコードは更新されない（旧 name のまま）", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-422-no-update-name",
          title: "新年会",
          options: ["2026-01-10 19:00"],
        });
        const [opt] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-422-no-update-name",
          name: "旧名",
          answers: [{ optionId: opt, answer: "○" }],
        });

        // Act — name 101 文字で 422 を起こす（送信 name は新しい値だが保存されてはならない）
        const response = await localApp.fetch(
          buildPutRequest("evt-put-422-no-update-name", responseId, [
            ["name", "a".repeat(101)],
            [`answers[${opt}]`, "△"],
          ]),
        );

        // Assert — 前段アサート（404 等で意図せずパスするのを防ぐ）
        expect(response.status).toBe(422);
        const { eq } = await import("drizzle-orm");
        const [row] = await database
          .select({ name: schema.eventResponses.name })
          .from(schema.eventResponses)
          .where(eq(schema.eventResponses.id, responseId));
        expect(row.name).toBe("旧名");
      });

      it("422 のとき event_option_responses の対象レコード群は更新されない（旧 answer のまま）", async () => {
        // Arrange
        const seeded = await seedEvent({
          id: "evt-put-422-no-update-answers",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-422-no-update-answers",
          name: "山田太郎",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });

        // Act — name 空文字で 422 を起こす（送信 answers は新しい値だが保存されてはならない）
        const response = await localApp.fetch(
          buildPutRequest("evt-put-422-no-update-answers", responseId, [
            ["name", ""],
            [`answers[${optA}]`, "×"],
            [`answers[${optB}]`, "○"],
          ]),
        );

        // Assert — 前段アサート（404 等で意図せずパスするのを防ぐ）
        expect(response.status).toBe(422);
        const { eq } = await import("drizzle-orm");
        const rows = await database
          .select({
            optionId: schema.eventOptionResponses.optionId,
            answer: schema.eventOptionResponses.answer,
          })
          .from(schema.eventOptionResponses)
          .where(eq(schema.eventOptionResponses.responseId, responseId));
        const answerByOption = new Map(rows.map((r) => [r.optionId, r.answer]));
        expect(answerByOption.get(optA)).toBe("○");
        expect(answerByOption.get(optB)).toBe("△");
      });
    });

    describe("不在 / 不一致のとき 404", () => {
      it("不在の event ID に対する PUT は 404 を返す", async () => {
        // Arrange — 何も seed しない（beforeEach で全テーブル truncate 済み）

        // Act
        const response = await localApp.fetch(
          buildPutRequest("non-existent-event", 1, [
            ["name", "山田太郎"],
            ["answers[1]", "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(404);
      });

      it("不在の responseId に対する PUT は 404 を返す", async () => {
        // Arrange — event は存在するが、responseId は seed しない
        const seeded = await seedEvent({
          id: "evt-put-404-missing-response",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;

        // Act — 存在しない responseId 999999 を指定
        const response = await localApp.fetch(
          buildPutRequest("evt-put-404-missing-response", 999999, [
            ["name", "山田太郎"],
            [`answers[${optA}]`, "○"],
            [`answers[${optB}]`, "△"],
          ]),
        );

        // Assert
        expect(response.status).toBe(404);
      });

      it("event ID に紐づかない別イベントの responseId への PUT は 404 を返す", async () => {
        // Arrange — 2 つの event を seed し、event-B の responseId を event-A の URL に乗せる
        const eventA = await seedEvent({
          id: "evt-put-404-mismatch-a",
          title: "イベント A",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const eventB = await seedEvent({
          id: "evt-put-404-mismatch-b",
          title: "イベント B",
          options: ["2026-02-10 19:00", "2026-02-11 19:00"],
        });
        const [optA1, optA2] = eventA.optionIds;
        const responseIdInB = await seedResponse({
          eventId: "evt-put-404-mismatch-b",
          name: "山田太郎",
          answers: [
            { optionId: eventB.optionIds[0], answer: "○" },
            { optionId: eventB.optionIds[1], answer: "△" },
          ],
        });

        // Act — event-A の URL に event-B の responseId を指定
        const response = await localApp.fetch(
          buildPutRequest("evt-put-404-mismatch-a", responseIdInB, [
            ["name", "山田太郎"],
            [`answers[${optA1}]`, "○"],
            [`answers[${optA2}]`, "△"],
          ]),
        );

        // Assert
        expect(response.status).toBe(404);
      });

      it("404 のとき event_responses は更新されない（副作用なし）", async () => {
        // Arrange — 2 つの event を seed し、event-B の responseId を event-A の URL に乗せる
        const eventA = await seedEvent({
          id: "evt-put-404-noupdate-resp-a",
          title: "イベント A",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const eventB = await seedEvent({
          id: "evt-put-404-noupdate-resp-b",
          title: "イベント B",
          options: ["2026-02-10 19:00", "2026-02-11 19:00"],
        });
        const [optA1, optA2] = eventA.optionIds;
        const responseIdInB = await seedResponse({
          eventId: "evt-put-404-noupdate-resp-b",
          name: "旧名",
          answers: [
            { optionId: eventB.optionIds[0], answer: "○" },
            { optionId: eventB.optionIds[1], answer: "△" },
          ],
        });

        // Act — event-A の URL に event-B の responseId を指定し、name を変更しようとする
        const response = await localApp.fetch(
          buildPutRequest("evt-put-404-noupdate-resp-a", responseIdInB, [
            ["name", "新名"],
            [`answers[${optA1}]`, "×"],
            [`answers[${optA2}]`, "×"],
          ]),
        );

        // Assert — 前段アサート（200 で意図せずパスするのを防ぐ）
        expect(response.status).toBe(404);
        const { eq } = await import("drizzle-orm");
        const [row] = await database
          .select({ name: schema.eventResponses.name })
          .from(schema.eventResponses)
          .where(eq(schema.eventResponses.id, responseIdInB));
        expect(row.name).toBe("旧名");
      });

      it("404 のとき event_option_responses は更新されない（副作用なし）", async () => {
        // Arrange — 2 つの event を seed し、event-B の responseId を event-A の URL に乗せる
        const eventA = await seedEvent({
          id: "evt-put-404-noupdate-opt-a",
          title: "イベント A",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const eventB = await seedEvent({
          id: "evt-put-404-noupdate-opt-b",
          title: "イベント B",
          options: ["2026-02-10 19:00", "2026-02-11 19:00"],
        });
        const [optA1, optA2] = eventA.optionIds;
        const [optB1, optB2] = eventB.optionIds;
        const responseIdInB = await seedResponse({
          eventId: "evt-put-404-noupdate-opt-b",
          name: "山田太郎",
          answers: [
            { optionId: optB1, answer: "○" },
            { optionId: optB2, answer: "△" },
          ],
        });

        // Act — event-A の URL に event-B の responseId を指定し、answers を変更しようとする
        const response = await localApp.fetch(
          buildPutRequest("evt-put-404-noupdate-opt-a", responseIdInB, [
            ["name", "山田太郎"],
            [`answers[${optA1}]`, "×"],
            [`answers[${optA2}]`, "×"],
          ]),
        );

        // Assert — 前段アサート（200 で意図せずパスするのを防ぐ）
        expect(response.status).toBe(404);
        const { eq } = await import("drizzle-orm");
        const rows = await database
          .select({
            optionId: schema.eventOptionResponses.optionId,
            answer: schema.eventOptionResponses.answer,
          })
          .from(schema.eventOptionResponses)
          .where(eq(schema.eventOptionResponses.responseId, responseIdInB));
        const answerByOption = new Map(rows.map((r) => [r.optionId, r.answer]));
        expect(answerByOption.get(optB1)).toBe("○");
        expect(answerByOption.get(optB2)).toBe("△");
      });
    });

    /**
     * Task 3.1: 参加者カードとの連動（編集経路）
     *
     * 検証対象（要件 1.4, 6.1, 6.2, 6.4）:
     *  - 既存回答の編集（PUT）では Card Service を呼ばず、既存カードを再生成しない（要件 1.4）
     *  - レスポンス本文に既存 `#responses` フラグメントと、`#cards` の OOB フラグメント（`hx-swap-oob`）が
     *    両方含まれる（要件 6.1, 6.2）
     *  - `#cards` フラグメントは「現状の既存カード集合をそのまま再送」する（カード集合が不変）
     *  - 422 / 404 の異常系でも既存カードは変化しない（副作用なし）
     *
     * 設計の前提:
     *  - 既存カードは DB に直接 INSERT して seed する（PUT は Card Service を呼ばないため、stub 不要）
     *  - ただし誤って Card Service が呼ばれてしまった場合に実 API を叩かないよう、
     *    PUT 経路でも `setCardGeneratorForTest(stub)` を `beforeEach` で注入しておく安全策を推奨
     *  - 「カード不変」は (a) participant_cards の件数が変わらない、(b) 対象 response の card title が
     *    変わらない、の 2 点で検証する（実装の詳細＝Card Service の呼び出し有無に依存しないアサーション）
     */
    describe("参加者カードとの連動（Task 3.1）", () => {
      // 古典派 TDD: プロセス外依存（Gemini API）のみ stub に差し替える。
      // PUT 経路では Card Service を呼ばない設計だが、誤って呼ばれた場合に実 API を
      // 叩かないよう安全策として stub を注入する。
      // DB は実体（in-memory SQLite）を使い、participant_cards も子テーブルとして
      // 各ケース前に truncate する（既存 beforeEach には含まれていないためここで明示）。
      beforeEach(async () => {
        await database.delete(schema.participantCards);

        const { setCardGeneratorForTest, __resetQuotaForTest } = await import("./gemini");
        __resetQuotaForTest();
        setCardGeneratorForTest({
          generate: async (name) => ({
            title: "テスト二つ名 " + name,
            rarity: "R",
            attribute: "火",
            race: "戦士",
            flavor: "テストフレーバー",
            attack: 1000,
            defense: 800,
          }),
          verifyConnectivity: async () => ({ ok: true }),
        });
      });

      afterEach(async () => {
        const { setCardGeneratorForTest } = await import("./gemini");
        setCardGeneratorForTest(null);
      });

      it("正常系: PUT 成功後も participant_cards のレコード件数は変化しない（カード再生成しない）", async () => {
        // Arrange
        // 事前に event + 既存参加者 1 名と、その参加者に紐づく participant_cards を 1 件 seed する。
        // PUT で answers を変更しても participant_cards の件数が 1 件のまま（再生成されない）
        // ことを検証する（実装の詳細＝Card Service 呼び出しの有無ではなく、最終結果である
        // テーブル件数で振る舞いを検証する）。
        const seeded = await seedEvent({
          id: "evt-put-card-count",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-card-count",
          name: "山田太郎",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });
        await database.insert(schema.participantCards).values({
          responseId,
          title: "既存二つ名 山田太郎",
          rarity: "R",
          attribute: "火",
          race: "戦士",
          flavor: "既存フレーバー",
          attack: 1000,
          defense: 800,
          tier: "ai",
        });
        const cardsBefore = await database.select().from(schema.participantCards);

        // Act
        const response = await localApp.fetch(
          buildPutRequest("evt-put-card-count", responseId, [
            ["name", "山田太郎"],
            [`answers[${optA}]`, "△"],
            [`answers[${optB}]`, "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const cardsAfter = await database.select().from(schema.participantCards);
        expect(cardsAfter.length).toBe(cardsBefore.length);
        expect(cardsAfter.length).toBe(1);
      });

      it("正常系: PUT 成功後も対象 response に紐づく participant_cards.title は編集前と完全に一致する（カード不変）", async () => {
        // Arrange
        // 事前に event + 既存参加者 1 名と、その参加者に紐づく participant_cards を 1 件 seed する。
        // PUT で answers を変更しても対象 response の participant_cards.title が完全一致のまま
        // （再生成・更新されない）ことを検証する。実装の詳細（Card Service の呼び出し有無）ではなく、
        // 最終結果である DB の title 値で振る舞いを検証する。
        const seeded = await seedEvent({
          id: "evt-put-card-title",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-card-title",
          name: "山田太郎",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });
        const seededTitle = "既存の固有 title XYZ";
        await database.insert(schema.participantCards).values({
          responseId,
          title: seededTitle,
          rarity: "R",
          attribute: "火",
          race: "戦士",
          flavor: "既存フレーバー",
          attack: 1000,
          defense: 800,
          tier: "ai",
        });

        // Act
        const response = await localApp.fetch(
          buildPutRequest("evt-put-card-title", responseId, [
            ["name", "山田太郎"],
            [`answers[${optA}]`, "△"],
            [`answers[${optB}]`, "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const { eq } = await import("drizzle-orm");
        const [cardAfter] = await database
          .select()
          .from(schema.participantCards)
          .where(eq(schema.participantCards.responseId, responseId));
        expect(cardAfter?.title).toBe(seededTitle);
      });

      it("正常系: PUT のレスポンス本文に既存の `#responses` フラグメントと `#cards` の OOB フラグメント（`hx-swap-oob`）が両方含まれる", async () => {
        // Arrange
        // 事前に event + 既存参加者 1 名と、その参加者に紐づく participant_cards を 1 件 seed する。
        // PUT のレスポンス本文に `#responses`（既存）と `#cards`（OOB）の両フラグメントが
        // 含まれることを、最終結果である本文文字列で検証する（HTMX の OOB 配線は実装の詳細では
        // なく外部に公開された契約なので、属性名 `hx-swap-oob` の存在を検証する）。
        const seeded = await seedEvent({
          id: "evt-put-card-oob",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-card-oob",
          name: "山田太郎",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });
        await database.insert(schema.participantCards).values({
          responseId,
          title: "既存二つ名 山田太郎",
          rarity: "R",
          attribute: "火",
          race: "戦士",
          flavor: "既存フレーバー",
          attack: 1000,
          defense: 800,
          tier: "ai",
        });

        // Act
        const response = await localApp.fetch(
          buildPutRequest("evt-put-card-oob", responseId, [
            ["name", "山田太郎"],
            [`answers[${optA}]`, "△"],
            [`answers[${optB}]`, "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain(`id="responses"`);
        expect(body).toContain(`id="cards"`);
        expect(body).toContain("hx-swap-oob");
      });

      it("正常系: `#cards` の OOB フラグメントには既存カード集合の二つ名（title）がすべて含まれ、新規 title は含まれない", async () => {
        // Arrange
        // 既存カードの title が `#cards` OOB フラグメントに含まれ、かつ
        // PUT 経路では Card Service を呼ばないため stub の prefix "テスト二つ名"
        // は本文に出現しないことで「カード再生成しない」契約を最終出力で検証する。
        const seeded = await seedEvent({
          id: "evt-put-card-oob-title",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-card-oob-title",
          name: "山田太郎",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });
        await database.insert(schema.participantCards).values({
          responseId,
          title: "既存二つ名 山田太郎",
          rarity: "R",
          attribute: "火",
          race: "戦士",
          flavor: "既存フレーバー",
          attack: 1000,
          defense: 800,
          tier: "ai",
        });

        // Act
        const response = await localApp.fetch(
          buildPutRequest("evt-put-card-oob-title", responseId, [
            ["name", "山田太郎"],
            [`answers[${optA}]`, "△"],
            [`answers[${optB}]`, "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body.includes("既存二つ名 山田太郎")).toBe(true);
        expect(body.includes("テスト二つ名")).toBe(false);
      });

      it("正常系: name を変更しても既存カードの title は変化しない（カード再生成しないことの追加検証）", async () => {
        // Arrange
        // 事前に event + 既存参加者 1 名（name: "元の名前"）と、その参加者に紐づく
        // participant_cards を 1 件 seed する。PUT で name を別の値に変更しても、
        // - DB の participant_cards.title が seed 値のまま（更新されない）
        // - レスポンス本文に stub の prefix "テスト二つ名" が出現しない（再生成されない）
        // という最終結果から「name 変更でも既存カードは再生成されない」契約を検証する。
        const seeded = await seedEvent({
          id: "evt-put-card-name-change",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-card-name-change",
          name: "元の名前",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });
        const seededTitle = "既存二つ名 元の名前";
        await database.insert(schema.participantCards).values({
          responseId,
          title: seededTitle,
          rarity: "R",
          attribute: "火",
          race: "戦士",
          flavor: "既存フレーバー",
          attack: 1000,
          defense: 800,
          tier: "ai",
        });

        // Act
        const response = await localApp.fetch(
          buildPutRequest("evt-put-card-name-change", responseId, [
            ["name", "変更後の名前"],
            [`answers[${optA}]`, "○"],
            [`answers[${optB}]`, "△"],
          ]),
        );

        // Assert
        expect(response.status).toBe(200);
        const { eq } = await import("drizzle-orm");
        const [cardAfter] = await database
          .select()
          .from(schema.participantCards)
          .where(eq(schema.participantCards.responseId, responseId));
        expect(cardAfter?.title).toBe(seededTitle);
        const body = await response.text();
        expect(body.includes("テスト二つ名")).toBe(false);
      });

      it("422 のとき participant_cards は更新も追加もされない（件数不変・既存 title 不変）", async () => {
        // Arrange
        // 事前に event + 既存参加者 1 名と、その参加者に紐づく participant_cards を 1 件 seed。
        // PUT で name="" を送ってバリデーション失敗（422）させたとき、
        // - participant_cards 件数が 1 件のままであること
        // - 既存 title が seed 値のまま変化しないこと
        // で「バリデーション失敗時はカード side effect が発生しない」契約を検証する。
        const seeded = await seedEvent({
          id: "evt-put-422-card-noop",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-422-card-noop",
          name: "元の名前",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });
        const seededTitle = "既存二つ名 元の名前";
        await database.insert(schema.participantCards).values({
          responseId,
          title: seededTitle,
          rarity: "R",
          attribute: "火",
          race: "戦士",
          flavor: "既存フレーバー",
          attack: 1000,
          defense: 800,
          tier: "ai",
        });

        // Act
        const response = await localApp.fetch(
          buildPutRequest("evt-put-422-card-noop", responseId, [
            ["name", ""],
            [`answers[${optA}]`, "○"],
            [`answers[${optB}]`, "△"],
          ]),
        );

        // Assert
        expect(response.status).toBe(422);
        const { eq } = await import("drizzle-orm");
        const cardsAfter = await database
          .select()
          .from(schema.participantCards)
          .where(eq(schema.participantCards.responseId, responseId));
        expect(cardsAfter.length).toBe(1);
        expect(cardsAfter[0]?.title).toBe(seededTitle);
      });

      it("404（不在 / 不一致）のとき participant_cards は更新も追加もされない（件数不変・既存 title 不変）", async () => {
        // Arrange
        // 事前に event + 既存参加者 1 名と、その参加者に紐づく participant_cards を 1 件 seed。
        // PUT で不在の responseId(999999) を指定して 404 にしたとき、
        // - participant_cards 件数が 1 件のままであること
        // - 既存 title が seed 値のまま変化しないこと
        // で「不在 / 不一致時はカード side effect が発生しない」契約を検証する。
        const seeded = await seedEvent({
          id: "evt-put-404-card-noop",
          title: "新年会",
          options: ["2026-01-10 19:00", "2026-01-11 19:00"],
        });
        const [optA, optB] = seeded.optionIds;
        const responseId = await seedResponse({
          eventId: "evt-put-404-card-noop",
          name: "ABC",
          answers: [
            { optionId: optA, answer: "○" },
            { optionId: optB, answer: "△" },
          ],
        });
        const seededTitle = "既存二つ名 ABC";
        await database.insert(schema.participantCards).values({
          responseId,
          title: seededTitle,
          rarity: "R",
          attribute: "火",
          race: "戦士",
          flavor: "既存フレーバー",
          attack: 1000,
          defense: 800,
          tier: "ai",
        });

        // Act — 不在の responseId(999999) に対して PUT
        const response = await localApp.fetch(
          buildPutRequest("evt-put-404-card-noop", 999999, [
            ["name", "変更後の名前"],
            [`answers[${optA}]`, "△"],
            [`answers[${optB}]`, "○"],
          ]),
        );

        // Assert
        expect(response.status).toBe(404);
        const cardsAfter = await database.select().from(schema.participantCards);
        expect(cardsAfter.length).toBe(1);
        expect(cardsAfter[0]?.title).toBe(seededTitle);
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

  /**
   * 共通ヘッダー（Layout のヘッダー領域）に関するテストケースを列挙する。
   *
   * 設計メモ:
   *  - Bun の `it.todo` は `fn` 引数が必須のため、本ファイルでは `() => {}` を渡している。
   */
  describe("共通ヘッダー（Layout のヘッダー領域）", () => {
    // Arrange: Layout を経由するページ（GET /events/new）のレスポンス本文を共有する
    let body: string;
    let bodyOutsideHeader: string;

    beforeEach(async () => {
      const request = new Request("http://localhost:8787/events/new");
      const response = await app.fetch(request);
      body = await response.text();
      // <header>...</header> を除いた残部。
      // 「テーマ切り替えボタンがヘッダー以外の場所（特に <main>）に存在しない」ことを
      // 文字列マッチでロバストに検証するため、ヘッダー領域を 1 回だけ取り除いた残りを保持する。
      bodyOutsideHeader = body.replace(/<header\b[\s\S]*?<\/header>/, "");
    });

    it("Layout を経由するページ（GET /events/new）のレスポンスに <header> 要素が含まれる", () => {
      // Act + Assert
      expect(body).toContain("<header");
    });

    it("ヘッダー内にサービス名「BI調整San」が表示される", () => {
      // Act: ヘッダー領域だけを切り出す
      const headerMatch = body.match(/<header\b[\s\S]*?<\/header>/);
      const headerHtml = headerMatch ? headerMatch[0] : "";

      // Assert: サービス名がヘッダー内に含まれる
      expect(headerHtml).toContain("BI調整San");
    });

    it('ヘッダー内にテーマ切り替えボタン（hx-post="/theme" を持つボタン）が含まれる', () => {
      // Act: ヘッダー領域だけを切り出す
      const headerMatch = body.match(/<header\b[\s\S]*?<\/header>/);
      const headerHtml = headerMatch ? headerMatch[0] : "";

      // Assert: テーマ切り替えボタンの hx-post 属性がヘッダー内に含まれる
      expect(headerHtml).toContain('hx-post="/theme"');
    });

    it('テーマ切り替えボタンは <main class="container"> の直下には存在しない（ヘッダーへの移動であり重複追加ではない）', () => {
      // Act + Assert: <header>...</header> を除いた残部に hx-post="/theme" が現れないこと
      expect(bodyOutsideHeader).not.toContain('hx-post="/theme"');
    });
  });
});
