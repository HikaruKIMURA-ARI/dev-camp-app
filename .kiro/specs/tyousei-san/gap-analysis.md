# Gap Analysis: tyousei-san

## 1. Current State Investigation

### 既存コードベースの全体像

| ファイル                           | 役割                                                                         | tyousei-san との関係                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/index.tsx` (80 行)            | Hono ルーティング・`zValidator` 連携・静的アセット配信・テーマ切替ハンドラ   | 既存ハンドラを **触らず**、新ルート群（`/events*`, `/webhooks*`）を **追記** する |
| `src/views.tsx` (142 行)           | `Layout` / `Page` / `MessageList` / `MessageForm` / `formatTime` 等の JSX    | `Layout` と `formatTime` は **汎用部品** として再利用候補。`Message*` は触らない  |
| `src/db.ts` (27 行)                | libsql クライアント生成・起動時マイグレーション・`listMessages`/`addMessage` | クライアント本体のみ共有。tyousei 用関数は追加・別ファイル化を要検討              |
| `src/schema.ts` (16 行)            | `messages` テーブル + 型導出                                                 | tyousei 用テーブル群を **同ファイル追記 or 別ファイル分割**を要決定               |
| `drizzle/0000_*.sql`, `0001_*.sql` | `messages` の初期作成と列追加                                                | 新 SQL は `bun run db:generate` で別ファイルとして増える                          |
| `tests/e2e/*.spec.ts`              | Playwright E2E（home / messages / theme）                                    | tyousei 用 spec を `tests/e2e/events.spec.ts` 等で追加                            |
| `package.json`                     | hono / htmx.org / drizzle-orm / libsql / pico / zod                          | **Alpine.js 未導入**。**Gemini SDK 未導入**。追加が必要                           |

### 抽出された規約（再利用すべきもの）

- **「初回 GET はフルページ / htmx 経由はフラグメント」**（`structure.md` の中核判断）
- **`zValidator` でバリデーション → 失敗時 `c.header("HX-Retarget", "#xxx")` でフォーム差し戻し**（`index.tsx:46-67` のパターンを踏襲）
- **`src/db.ts` のクライアントを単一インスタンス・起動時マイグレーション**（`db.ts:7-14`）
- **`typeof xxx.$inferSelect` でスキーマから型導出**（`schema.ts:14-15`）
- **`serveStatic` で `node_modules` から CSS/JS 配信**（`index.tsx:34-38`）
- **JSX は `hono/jsx` の `FC`、views は schema 型のみ import、`Context` を触らない**（`views.tsx` 全体）
- **テーマ切替の Cookie + `HX-Refresh` パターン**（リッチな UI 状態管理は htmx + サーバ往復で行うのが既存スタイル）

### 注意すべき制約

- **`Layout` には現状「テーマ切替ボタン」が埋め込まれている**（`views.tsx:28-30`）。tyousei-san の `<Layout>` 再利用時もこのボタンが出るが、要件 5 と矛盾しない（汎用機能のため）。**ただしハードコード位置のため再利用条件としてはやや硬い**。
- **既存 `Layout` の `<head>` には htmx しか入っていない**（`views.tsx:24`）。Alpine.js は `<head>` に追加配置する必要があり、「メッセージボードに依存しない」観点では Layout を拡張するか別 Layout を切るかの判断が要る。
- **`index.tsx` は単一ファイルで全ルート定義**。tyousei で 7-9 個のルートを足すと 200+ 行になり、可読性低下が見込まれる（structure.md は「ファイル数が増えて 1 ファイル 1 責務で収まらなくなった時点で分割」を許容）。
- **テスト DB の規約**: `process.env.TURSO_DATABASE_URL = ":memory:"` を `db` の動的 import 前にセット（`tech.md:55`）。tyousei のテストでも同様のセットアップが必要。

---

## 2. Requirement-to-Asset Map

| 要件                                                | 既存資産                                         | ギャップ種別          | 必要な対応                                                                           |
| --------------------------------------------------- | ------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------ |
| Req 1: イベント作成（タイトル・候補・カスタム設問） | `zValidator` パターン / `MessageForm` の差し戻し | **Missing**           | `events` テーブル追加・`/events/new` ハンドラ・候補日時動的追加 UI・カスタム設問入力 |
| Req 2: イベント閲覧と集計                           | フルページ返却パターン                           | **Missing**           | `/events/:id` ハンドラ・参加者 × 候補のクロス集計関数・404 ページ                    |
| Req 3: 参加者の回答登録                             | htmx フラグメント差し替え                        | **Missing**           | `/events/:id/responses` ハンドラ・`event_responses` 永続化・○△× 値検証               |
| Req 4: 既存参加者の回答更新                         | `HX-Retarget` パターン                           | **Missing**           | `PUT /events/:id/responses/:responseId`・編集モードのフラグメント切替                |
| Req 5: htmx 規約 + 既存からの独立                   | `views.tsx` の責務分離                           | **Constraint**        | tyousei 用 views を `views.tsx` 内に追記すると独立性が損なわれる → ファイル分割推奨  |
| Req 6: 永続化とスキーマ                             | `schema.ts` / `db.ts` / drizzle-kit              | **Missing**           | `events` / `event_options` / `event_responses` / `slack_webhooks` 4 テーブルと FK    |
| Req 7: カスタム設問（プラスアルファ）               | （なし）                                         | **Missing**           | `events.custom_question` 列・`event_responses.custom_answer` 列・XSS エスケープ      |
| Req 8: Slack 催促通知 + Gemini 動的生成             | （なし）                                         | **Missing + Unknown** | Webhook CRUD・Gemini API クライアント・3 段フォールバック・プロセス内クォータフラグ  |
| Req 9: アクセシビリティと UI 標準                   | pico.css 既導入                                  | **Constraint**        | 既存 pico 規約の踏襲のみ。新規追加なし                                               |
| Req 10: Alpine.js による状態管理                    | （なし）                                         | **Missing**           | `package.json` 追加・`Layout` への script 追加・`htmx:afterSwap` 再初期化配線        |

### Research Needed（設計フェーズで深掘り）

- **R1: Gemini API のモデル名と無料枠仕様** — 要件で `gemini-flash-lite` 相当と記述されているが、実在するモデル名・エンドポイント・レート制限の具体（429 / 403 のレスポンス形）の確定が必要。`@google/genai` SDK 採用 vs 素の `fetch` でのリクエスト構築の判断。
- **R2: Alpine.js と htmx の統合パターン** — `htmx:afterSwap` で Alpine の `Alpine.initTree(target)` を呼ぶ標準パターンの確認。Alpine は `defer` 読み込みで `DOMContentLoaded` 起点だが、htmx swap 後の DOM では再初期化が必要。
- **R3: イベント ID 生成方式** — 「推測困難な文字列」を要件 1.6 が要求。`crypto.randomUUID()`（標準・Bun ネイティブ） vs `nanoid`（短い URL）。新規依存追加の許容範囲を判断。
- **R4: プロンプトインジェクション対策の具体形** — 要件 8.15 が「タイトル文字列を引用区切りで囲む」と指示。Gemini の `systemInstruction` / `contents.parts` 構造でユーザ入力をどう分離するかの実装パターン確定。
- **R5: 5 秒タイムアウトの実装** — `fetch` の `AbortSignal.timeout(5000)` で十分か、`Promise.race` 併用か、Bun のネイティブサポート状況の確認。

---

## 3. Implementation Approach Options

### Option A: 既存ファイルを拡張（フラット維持）

**概要**: `src/index.tsx` に `/events*` `/webhooks*` ルートを直接追記、`src/views.tsx` に `EventPage` `EventForm` `ResponseRow` 等を追記、`src/db.ts` に `createEvent` `listEvents` 等を追記、`src/schema.ts` に 4 テーブルを追記。

- **適合性**: structure.md の「フラット構成」の方針には素直に合う
- **互換性**: 既存メッセージボード機能には触らないので破壊的変更なし
- **複雑度**: `index.tsx` は 80 → 約 280-330 行、`views.tsx` は 142 → 約 380-450 行、`db.ts` は 27 → 約 120-150 行に膨張

**Trade-offs**:

- ✅ 新規ファイル追加が最小、ファイル間の import チェーンが浅い
- ✅ 既存規約との整合性が高く、迷いが少ない
- ❌ 単一ファイルが肥大化し「1 ファイル 1 責務」が崩れる
- ❌ **要件 5.7（メッセージボードと独立した「ファイル または シンボル」）の解釈で「ファイル」を要求された場合に成立しない**
- ❌ メッセージボードを将来削除するときに同一ファイル内のコードを切り分ける作業が発生

### Option B: 新規サブディレクトリで完全分離

**概要**: `src/tyousei/` を切り、`tyousei/index.ts` (Hono サブアプリ) / `tyousei/views.tsx` / `tyousei/db.ts` / `tyousei/schema.ts` / `tyousei/notifications.ts` 等を配置。`src/index.tsx` で `app.route("/", tyouseiApp)` のようにマウント。`db.ts` のクライアントだけは共有。

- **適合性**: structure.md は「ファイル数が増えて 1 ファイル 1 責務で収まらなくなった時点で」サブディレクトリ化を許容しており、tyousei は明確に該当
- **互換性**: メッセージボード関連ファイルに 1 行も触らないので独立性が最大
- **複雑度**: ディレクトリ構造の判断と命名規約の追加が必要

**Trade-offs**:

- ✅ 要件 5.6-5.9（メッセージボードからの独立）を物理的に保証
- ✅ メッセージボード削除が `src/index.tsx` の 1 行 + `src/views.tsx` の関連コンポーネント + `messages` テーブル削除だけで完結する
- ✅ ファイルあたりの責務が明確で、TDD のテスト配置も自然（`tyousei/db.test.ts` 等）
- ❌ 既存の「フラット」哲学から逸脱する初の判断（projet 全体の方針転換となる）
- ❌ Hono のサブアプリマウントを学習する必要（小コスト）

### Option C: ハイブリッド（共有部はフラットに、tyousei 固有は別ファイル群を `src/` 直下に）

**概要**: `src/tyousei-routes.ts` / `src/tyousei-views.tsx` / `src/tyousei-db.ts` / `src/tyousei-schema.ts` / `src/notifications.ts` のように **`src/` 直下のファイル名プレフィックスで分離**。`Layout` のような汎用部品は `views.tsx` から再 export しつつ、tyousei 専用はすべて新ファイル。サブディレクトリは作らない。

- **適合性**: フラット構成を維持しつつ「ファイル名の名前空間」で論理分離
- **互換性**: メッセージボードに無干渉。Layout は再利用するが、ハードコードされたテーマ切替ボタンを許容するか、Layout を `views.tsx` から `src/layout.tsx` に切り出して共有部品化するかを設計時に決める
- **複雑度**: ファイル数は Option B と同等だが階層が浅い

**Trade-offs**:

- ✅ structure.md の「フラット維持」を厳格に守れる
- ✅ 要件 5.7 の「ファイル独立」を満たす（同名プレフィックスで識別可能）
- ✅ 既存ファイル（`views.tsx` / `db.ts`）への追加は最小（クライアント export と Layout の汎用化のみ）
- ❌ ファイル名プレフィックス管理が緩く、放置すると再びフラットファイルが増殖して整理が遅れる
- ❌ ルーティングは `index.tsx` 一箇所集約のままなので、`index.tsx` が再び肥大化する（ルート登録のみで 30-40 行追加）

---

## 4. Effort & Risk

| ブロック                                   | Effort  | Risk       | 根拠                                                                                                                                           |
| ------------------------------------------ | ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Req 1-4 イベント / 参加者 CRUD             | **M**   | **Low**    | 既存 `zValidator` + htmx + drizzle のパターンに乗る。集計関数のロジックがやや複雑                                                              |
| Req 6 スキーマ + マイグレーション          | **S**   | **Low**    | drizzle-kit 既導入、4 テーブル + FK + cascade のみ。`db:generate` が自動生成                                                                   |
| Req 7 カスタム設問                         | **S**   | **Low**    | スキーマ列追加 + フォーム分岐 + XSS エスケープ。Hono JSX は標準でエスケープ済み                                                                |
| Req 8 Webhook CRUD                         | **S**   | **Low**    | 単純な CRUD。URL 検証は `z.string().regex(/^https:\/\/hooks\.slack\.com\//)` で完結                                                            |
| **Req 8 Gemini 連携 + 3 段フォールバック** | **M**   | **Medium** | 外部 API・タイムアウト・プロンプトインジェクション対策・プロセス内クォータフラグ・モックの設計が必要（プロセス外依存なのでテストでモック可）   |
| Req 10 Alpine.js 統合                      | **S-M** | **Medium** | 単独導入は容易だが、**htmx swap 後の Alpine 再初期化** が落とし穴になりやすい。MVP でモーダル/タブが本当に必要か（要件は条件付き）も含めて確認 |
| Req 5/9 規約遵守                           | **S**   | **Low**    | 既存規約の追従のみ                                                                                                                             |

**全体**: **L（1-2 週）相当** / **総合 Risk: Medium**（外部 API 統合と Alpine.js が初導入のため）

---

## 5. Recommendations for Design Phase

### 推奨アプローチ: **Option B または Option C**

**理由**:

- 要件 5.6-5.9 が「メッセージボードへの非依存」を明示的に求めており、Option A はファイル粒度では満たせない
- tyousei-san は **将来単独で残ることが前提**（要件冒頭の Adjacent expectations）。物理的にも独立している方が削除耐性が高い
- structure.md は分割の閾値を「1 ファイル 1 責務で収まらなくなった時点」と定めており、tyousei は **追加されるルート数 (7-9) と新規テーブル数 (4) から見て明らかに該当**

**Option B（サブディレクトリ）と Option C（プレフィックス）の選択軸**:

- Option B = プロジェクト全体の構造哲学の転換。今後も特定ドメイン（webhook 等）を追加する想定があるなら Option B
- Option C = 1 ドメインだけ追加するなら最小コスト。フラット原則を守れる

→ **設計フェーズでこの 2 択をユーザに確認推奨**。

### 設計時の重要決定事項

1. **Layout の汎用化** — `views.tsx` の `Layout` をそのまま再利用するか、`src/layout.tsx` に切り出して message-board 固有のテーマボタン箇所を `children` 化するか
2. **DB アクセス関数の配置** — `src/db.ts` に追記（クライアントと近接）vs `src/tyousei-db.ts` 等に分離（独立性優先）
3. **Hono サブアプリ vs `index.tsx` への直接登録** — Option B の場合のマウント方式
4. **ID 生成方式** — `crypto.randomUUID()` を採用すれば依存追加なし。`nanoid` を採用すれば短い URL
5. **Gemini SDK 採用判断** — `@google/genai` を入れるか、`fetch` ベースで自前ラップするか（外部依存最小化観点）
6. **Alpine.js の必要性確認** — MVP のモーダル/タブが「本当に必要な UI」か、`<details>` 等で代替可能かを設計時に再検証（要件 10.5 が `<details>/<summary>` を優先と明記）

### Carry Forward（設計フェーズで詳細化）

- R1 ~ R5 の Research Needed 項目すべて
- 集計テーブルのレンダリング戦略（候補 × 参加者の二次元グリッドを Hono JSX でどう書くか）
- バリデーション失敗時のフラグメント差し戻し範囲（ページ全体 vs フォームのみ）の細部設計
- テスト戦略: Gemini と Slack Webhook はプロセス外依存 → モック許容。集計ロジックと永続化は実 DB（古典派）
