import { describe, expect, it } from "bun:test";
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
});
