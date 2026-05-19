# Implementation Plan

実装は古典派 TDD（`.claude/rules/testing/test-philosophy.md`）に従い、`tdd-workflow` skill で各サブタスクを Phase 1-4 で進める。プライベート依存は実体を使い、プロセス外依存（Gemini / Slack）のみモック。共有依存（DB）は `:memory:` + `beforeEach` クリーンアップで隔離する。

- [x] 1. Foundation: messageboard 撤去とインフラ整備

- [x] 1.1 既存実装のクリーンアップ（最低限の雛形を残して破棄）
  - **破棄するもの**:
    - `src/index.tsx` 内の `GET /` / `POST /messages` などメッセージボード用ハンドラと関連 zod schema
    - `src/views.tsx` の `Page` / `MessageList` / `MessageForm` / `formatTime` 等メッセージボード専用コンポーネント
    - `src/db.ts` の `listMessages` / `addMessage` などメッセージボード用クエリ関数
    - `src/schema.ts` の `messages` テーブル定義と `Message` 型
    - `drizzle/0000_*.sql` / `drizzle/0001_*.sql` および `drizzle/meta/` 内の対応スナップショット
    - `src/index.test.ts` 全体（メッセージボード用テスト）
    - `tests/e2e/` 配下のメッセージボード / ホーム用 spec（テーマ切替の E2E が独立して残る価値があれば最小限維持してよい）
  - **残す最低限の雛形**:
    - `src/index.tsx`: Hono アプリ組み立て、`serveStatic` 配線（htmx / pico）、`POST /theme` のテーマ切替ハンドラ、`{ port, fetch }` の default export だけの骨格
    - `src/views.tsx`: `<Layout>`（テーマ切替ボタン含む汎用シェル）のみ。`Page` 等のドメイン専用コンポーネントは残さない
    - `src/db.ts`: libsql クライアント生成と起動時 `await migrate(...)` の呼び出しだけ
    - `src/schema.ts`: 空ファイル（テーブル定義は 1.2 で追加）
    - `drizzle/`: 既存 SQL を削除した状態（新規 SQL は 1.2 の `bun run db:generate` で再生成）
    - `tests/e2e/fixtures/` のヘルパは残してよい（後続タスクで再利用）
  - completion: `bun run dev` がエラーなく起動し、`/messages` 含む旧ルートが全て 404、`grep -rE "messages|MessageList|MessageForm|listMessages|addMessage" src/ drizzle/` が一切ヒットしない、`bun test` がテスト 0 件で正常終了する
  - _Requirements: 5.6, 5.7_

- [x] 1.2 出欠調整ドメインの Drizzle スキーマを定義
  - `events` / `event_options` / `event_responses` / `event_option_responses` / `slack_webhooks` の 5 テーブルを `src/schema.ts` に定義し、全 FK を `onDelete: "cascade"` で結線する
  - `events.id` は uuid 想定の text PK、`events.custom_question` を nullable text、`event_responses.custom_answer` を nullable text として持たせる
  - `event_option_responses.answer` は `○` / `△` / `×` の 3 値のみ受ける前提のカラムとして定義する
  - `$inferSelect` で型を導出して export し、ハンドコードしない
  - `bun run db:generate` を実行して `drizzle/` 配下に新規初期マイグレーション SQL を生成する
  - completion: 起動時に 5 テーブルが作成され、`bun run db:studio` で構造を目視確認できる
  - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.6, 6.7, 6.8, 7.1_

- [x] 1.3 db クライアントの単一インスタンスと起動時マイグレーションを維持
  - `src/db.ts` で libsql クライアントを 1 つだけ生成し export、import 時に `migrate()` を実行
  - 全データアクセス関数（後続タスクで追加される `createEvent` / `getEventWithOptions` / `addResponse` / `updateResponse` / `listWebhooks` / `addWebhook` / `getWebhookById`）をこのファイルに集約する方針を確立し、views / routes が直接 SQL を書かないことを担保する
  - completion: テストで `TURSO_DATABASE_URL=":memory:"` をセットしてから `./db` を動的 import すれば 5 テーブルが立ち上がる
  - _Requirements: 5.3, 5.4, 6.3_

- [x] 1.4 Alpine.js 導入と Layout 拡張
  - `package.json` に `alpinejs` を追加し、`node_modules` から `serveStatic` 経由で `/static/alpine.min.js` として配信する（CDN 直リンク禁止）
  - `Layout` の `<head>` で htmx → Alpine の順に `defer` で読み込むよう拡張する
  - `<body>` 末尾に `document.body.addEventListener("htmx:afterSwap", (e) => window.Alpine?.initTree(e.detail.target))` を仕込み、swap 後の DOM でも Alpine が初期化される構成を作る
  - Alpine 利用は `x-data` / `x-show` / `x-on` 等の宣言で書く前提で配線し、単純な開閉は `<details>/<summary>` で代替する規約を整える（モーダル等を追加する際は `role="dialog"` / `aria-modal="true"` をセットで適用）
  - Alpine が読み込めない（JS 無効等）環境でも、フォーム送信・回答登録などのコア機能は通常のフォーム POST + htmx の部分更新で動作する構成を維持する
  - completion: 次タスクで実装する `/events/new` を開いて `window.Alpine !== undefined`、htmx swap で挿入された DOM 内の `x-data` も初期化される
  - _Requirements: 5.8, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

- [x] 1.5 Hono サブアプリ骨格とアプリ組み立て
  - `src/routes.tsx` を Hono サブアプリとして作成し、`src/index.tsx` で `app.route("/", routes)` でマウントする
  - `src/index.tsx` は「アプリ組み立て + `serveStatic`（htmx / Alpine / pico）+ テーマ切替 + サブアプリマウント + `{ port, fetch }` export」だけを担い、ハンドラ実装を持たせない
  - `GET /` で 302 を返し `Location: /events/new` にする
  - completion: `bun run dev` で `GET /` が `/events/new` に 3xx でリダイレクトし、他のイベント / Webhook ルートは未実装で 404
  - _Requirements: 5.9_

- [ ] 2. イベント作成

- [x] 2.1 イベント作成フォームのフルページ
  - `GET /events/new` で `<EventNewForm/>` を含むフルページを返す
  - タイトル入力、候補日時の動的追加（Alpine の `x-data` で行を追加・削除）、任意のカスタム設問入力欄を備える
  - 全 input に `<label>` を関連付け、pico.css のセマンティック要素で組む。タップ領域は概ね 44px 四方以上を確保し、pico.css のデフォルト配色のみ使用する
  - 375 / 768 / 1280 の viewport でレイアウト崩れを起こさない
  - completion: `GET /events/new` で 200 とフォームが表示され、Alpine の候補追加・削除が動く
  - _Requirements: 1.1, 5.1, 9.1, 9.2, 9.3, 9.4, 10.1_

- [x] 2.2 イベント作成の永続化と差し戻し
  - `POST /events` を **htmx を介さない通常フォーム送信**として受け、`zValidator("form", eventCreateSchema)` で `title` 1..200 / `options` 1+ 件・各 1..200・重複なし / `customQuestion?` 0..200 を検証
  - `crypto.randomUUID()` で event ID を生成し、`events` + `event_options` を単一 tx で永続化、`customQuestion` 空文字は null として保存
  - 成功時は 302 で `/events/:id` にリダイレクト
  - 検証失敗時は 422 で `<EventNewForm/>` を `<Layout>` 内に再描画し入力値を保持（`HX-Retarget` ではなくフルページ）
  - completion: 正常 form で DB に 1 レコード作成 + 302、空タイトル / 候補 0 件 / 候補重複 / カスタム設問 201 文字で 422 + 入力値保持、event ID が推測困難な uuid 形式
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 5.5, 7.5, 7.7_

- [ ] 3. イベント閲覧と集計

- [x] 3.1 イベント閲覧フルページと集計表示
  - `GET /events/:id` で `<EventPage>`（`<Layout>` 内包）を返す
  - `getEventWithOptions` でイベント・候補・参加者・回答・候補ごとの ○/△/× 集計を取得し `<ResponsesTable/>` で表示
  - 参加者を登録順（古い順）で表示し、候補ごとに ○/△/× の人数を集計行として描画
  - 参加者 0 名のときは「まだ回答がありません」と回答フォームのみを表示
  - カスタム設問が設定されているときのみ参加者行にカスタム設問への回答列を追加表示。未設定なら列ごと描画しない
  - 不在 ID のときは 404 と `<NotFoundPage/>` を返す
  - 集計表テキストのコントラスト比は WCAG AA 相当（4.5:1）以上を担保し、Hono JSX の自動エスケープにより XSS を防止する
  - completion: 既存イベント ID で集計表と参加者行が登録順で表示、参加者 0 名で空状態メッセージ、不在 ID で 404、カスタム設問なしのイベントで列が描画されない
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 5.1, 7.3, 7.4, 7.7, 9.5_

- [ ] 4. 参加者の回答登録と更新

- [x] 4.1 回答登録（htmx フラグメント差し替え）
  - `POST /events/:id/responses` で `zValidator("form", responseSchema)` を実行（`name` 1..100、`answers` キーが該当候補 ID で値 `○|△|×` のみ、`customAnswer?` 0..500）
  - `event_responses` + `event_option_responses` を単一 tx で永続化し、`customAnswer` は空文字を空文字のまま保存する（空文字を許容）
  - 回答フォームのカスタム設問入力欄は自由記述（プレーンテキスト）のみとし、ラジオ / チェックボックス / 数値入力等は提供しない
  - 成功時は `<ResponsesTable/>` フラグメント（`#responses` 差し替え）を返す
  - 検証失敗時は 422 + `HX-Retarget #response-form` でフォーム差し戻し（入力値保持）
  - 不在イベント ID で 404、同名参加者は別レコードとして登録（同名重複を許容）
  - カスタム設問なしのイベントでは入力欄を描画しない
  - completion: 正常回答で集計表に反映、空名前で 422 + 入力値保持、`○△×` 以外で 422、設問回答 501 文字で 422、不在 ID で 404、設問なしイベントで入力欄が描画されない
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 5.2, 5.5, 7.2, 7.6, 7.7_

- [x] 4.2 回答編集モードと更新
  - 編集ボタン押下で対象参加者行を `<ResponseFormRow mode="edit"/>` フラグメントに差し替えるルートを追加
  - `PUT /events/:id/responses/:responseId` で `updateResponse` を実行し、新規回答と同じバリデーション規則（名前 / 各候補への回答 / カスタム設問への回答）を適用、`event_option_responses` も上書きする
  - カスタム設問への既存回答を編集フォームに初期値として表示
  - 編集対象 responseId が該当イベントに紐づかないとき 404
  - 成功時は `<ResponsesTable/>` フラグメントを返す
  - completion: 既存参加者を編集 → 保存で集計表に反映、別イベントの responseId で 404、カスタム設問の既存値が編集フォームに初期表示される
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.2_
