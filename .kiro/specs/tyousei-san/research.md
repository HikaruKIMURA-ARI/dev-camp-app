# Research & Design Decisions: tyousei-san

## Summary

- **Feature**: `tyousei-san`
- **Discovery Scope**: Complex Integration（外部 API 2 系統 + 新クライアント JS ライブラリ + 4 テーブル新設）
- **Key Findings**:
  - **Gemini API 無料枠**: `gemini-2.5-flash-lite` を採用予定。15 RPM / 1,000 RPD。枯渇時は HTTP 429 `RESOURCE_EXHAUSTED`。RPM は 60 秒で回復、RPD は日次リセット。プロセス内で 429/403 を検知したら以後 Gemini を呼ばずにフォールバック直行する設計が要件 8.25 と整合
  - **Alpine.js × htmx 統合**: htmx で swap された DOM には Alpine の状態が伝播しない。`htmx:afterSwap` リスナで `Alpine.initTree(event.detail.target)` を呼ぶのが標準パターン。`alpine-morph` 拡張という代替もあるが、本プロジェクトの swap は `outerHTML` の単純差し替えで足りるため `initTree` で十分
  - **既存コードベースは「フラットなレイヤー分割（既存哲学そのまま）」と相性が良い**: 既存検証用 messageboard 機能を完全撤去する前提で、`index.tsx` / `views.tsx` / `db.ts` / `schema.ts` の中身を tyousei に書き替え、`routes.tsx`（ハンドラ集約）と `notifications.ts`（外部依存ラッパ）の 2 ファイルだけ新規追加する構成が最小コスト。ドメイン接頭辞は付けない（アプリ全体が tyousei-san の単一機能だから不要）

---

## Research Log

### Topic: Gemini API 無料枠と 3 段フォールバック発火条件

- **Context**: 要件 8.13 / 8.21-8.26 が「無料枠の軽量モデル」「3 段フォールバック（Tier 1: Gemini 動的生成 / Tier 2: テンプレート / Tier 3: タイトル+URL のみ）」「無料枠枯渇後はプロセス内で Gemini 停止」を求めている。実モデル名と枯渇時のレスポンス形式の確定が必要
- **Sources Consulted**:
  - [Rate limits | Gemini API | Google AI for Developers](https://ai.google.dev/gemini-api/docs/rate-limits)
  - [Gemini Developer API pricing | Gemini API | Google AI for Developers](https://ai.google.dev/gemini-api/docs/pricing)
  - [Gemini API Free Tier 2026 (TokenMix)](https://tokenmix.ai/blog/gemini-api-free-tier-limits)
  - [Gemini API 429 RESOURCE_EXHAUSTED 解説](https://blog.laozhang.ai/en/posts/gemini-api-rate-limits-guide)
- **Findings**:
  - 無料枠の軽量モデル名は **`gemini-2.5-flash-lite`**（要件の「`gemini-flash-lite` 相当」を解釈）
  - 無料枠制限（執筆時点）: **15 RPM / 1,000 RPD**。プロジェクト単位（API キー単位ではない）
  - **429 RESOURCE_EXHAUSTED**: RPM / RPD / TPM のいずれか超過時に返る。レスポンス本文に `error.status: "RESOURCE_EXHAUSTED"` と詳細
  - **403**: API キー無効・課金プロジェクト未関連付け等、構造的な拒否時
  - エンドポイント: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent` に `?key=<API_KEY>` を付与（または `x-goog-api-key` ヘッダ）
- **Implications**:
  - **Tier 切替条件の確定**:
    - HTTP 429 / 403 → **Tier 3** + プロセス内クォータフラグを立てて以後 Gemini 呼び出しを停止（要件 8.24-8.25）
    - HTTP 5xx / ネットワークエラー / タイムアウト / パースエラー → **Tier 2**（要件 8.23）
    - `GEMINI_API_KEY` 未設定 → 起動時から **Tier 2 直行**（要件 8.22）
  - **タイムアウト**: 要件 8.27 が 5 秒以内を要求。`AbortSignal.timeout(5000)` で実装可能（Bun ネイティブ対応）
  - **プロンプトインジェクション**: ユーザ入力（イベントタイトル）は `systemInstruction` ではなく `contents.parts` の中で引用区切り（例: バッククォート 3 連 ` ``` `）で囲む（要件 8.15）

### Topic: Alpine.js を htmx スワップ後の DOM で再初期化する方法

- **Context**: 要件 10.4 が「htmx の部分更新で挿入された DOM に対しても Alpine.js が初期化されるよう、`htmx:afterSwap` 等で再初期化が走る構成を維持する」と明示
- **Sources Consulted**:
  - [Alpine + HTMX (alpinejs/alpine#2605)](https://github.com/alpinejs/alpine/discussions/2605)
  - [HTMX and Alpine.js Interoperability via Events and Lifecycle Hooks (Cursa)](https://cursa.app/en/page/htmx-and-alpine-js-interoperability-via-events-and-lifecycle-hooks)
  - [When to Add Alpine.js to htmx (DEV)](https://dev.to/alex_aslam/when-to-add-alpinejs-to-htmx-9bj)
  - [Using Alpine.js In HTMX (Ben Nadel)](https://www.bennadel.com/blog/4787-using-alpine-js-in-htmx.htm)
- **Findings**:
  - 標準パターン: `document.body.addEventListener("htmx:afterSwap", (e) => Alpine.initTree(e.detail.target))`
  - `alpine-morph` 拡張は htmx 1.x 系の拡張ライブラリ（v1 docs 由来）。本プロジェクトは htmx 2.x のため不採用
  - Alpine 3.x は MutationObserver で自動初期化を行うが、`Alpine.deferMutations()` で抑制されている場合や CSP 環境では `initTree` の明示呼び出しが堅実
  - 読み込み順: htmx → Alpine の順に `defer` 読み込みすれば、`DOMContentLoaded` で htmx → Alpine が順次初期化される
- **Implications**:
  - `Layout` の `<head>` に `<script src="/static/alpine.min.js" defer />` を htmx の **後** に追加
  - `Layout` 内に小さなインライン `<script>` で `htmx:afterSwap` リスナを 1 つ登録し、`Alpine.initTree(e.detail.target)` を呼ぶ
  - リスナは Alpine がグローバルに居る前提で書くが、Alpine 未読み込み時のガード（`window.Alpine?.initTree`）を入れておく

### Topic: Slack Incoming Webhook の最小ペイロード

- **Context**: 要件 8.20 が「`{ "text": "<最終本文>" }` の最小形式」を明示
- **Sources Consulted**: 既知の Slack 公式仕様
- **Findings**:
  - エンドポイント: `https://hooks.slack.com/services/T.../B.../...`（要件 8.4 の `https://hooks.slack.com/` プレフィックス検証で十分）
  - メソッド: POST、`Content-Type: application/json`、ボディ `{"text":"..."}`
  - 成功時: HTTP 200 / `ok` をテキストで返す
  - 認証情報は URL に埋め込まれているため、追加ヘッダ不要
- **Implications**:
  - `fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })` で完結
  - 2xx 以外でフォールバックエラー判定（要件 8.11）

### Topic: イベント ID の生成方式

- **Context**: 要件 1.6 が「推測困難な文字列で URL を構成する」と要求。短さ・依存追加コスト・衝突確率のトレードオフ検討
- **Sources Consulted**: Web 標準（`crypto.randomUUID`）と nanoid の比較
- **Findings**:
  - `crypto.randomUUID()`: Bun ネイティブ対応・依存追加なし・36 文字（ハイフン込み）
  - `nanoid`: 既定 21 文字、URL safe、外部依存追加が必要
- **Implications**:
  - 本プロジェクトは依存最小化方針（CLAUDE.md / steering tech.md）を強く打ち出している
  - **`crypto.randomUUID()` を採用**。URL は `/events/<uuid>` の形になり、推測困難性は満たす（122 ビット）
  - URL の冗長さは MVP 上の許容範囲

### Topic: Hono サブアプリのマウントと「フラット維持」の整合

- **Context**: tyousei のルートを `index.tsx` に直接書き足すか、Hono のサブアプリとして切り出して `app.route()` でマウントするか
- **Sources Consulted**: Hono 公式パターン
- **Findings**:
  - Hono は `const routes = new Hono(); routes.get("/events/new", ...); app.route("/", routes);` の合成が標準
  - サブアプリは別ファイル（`src/routes.tsx`）に切り出せる
- **Implications**:
  - **`src/routes.tsx` にサブ Hono アプリを切り出す**。`src/index.tsx` には `import { routes } from "./routes"; app.route("/", routes);` の 2 行追加に留め、`index.tsx` は「アプリ組み立て + `serveStatic` + テーマ + マウント」だけの薄いエントリにする
  - messageboard を完全撤去するため、`src/index.tsx` から既存ハンドラ群を削除した跡地にこのマウント 1 行が入る形になる（要件 5.6-5.9 の単一機能アプリ化を担保）

---

## Architecture Pattern Evaluation

| Option                                    | Description                                                                                                                   | Strengths                                                                                 | Risks / Limitations                                                                                        | Notes                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| A: 既存ファイルを拡張（messageboard 残）  | `index.tsx` / `views.tsx` / `db.ts` / `schema.ts` に直接追記し、messageboard も併存                                           | 新規ファイル最小                                                                          | ファイル肥大、要件 5.6-5.7（messageboard を残置しない）に違反、削除時に切り分け作業発生                    | 不採用                                                     |
| B: サブディレクトリ `src/tyousei/`        | tyousei 配下にレイヤー別ファイルを集約                                                                                        | 物理的独立性が最大、将来ドメイン追加時の指針になる                                        | プロジェクト全体の構造哲学を「フラット → ドメイン分割」へ転換する判断が必要、単独ドメインには大袈裟        | 不採用。次以降の拡張機能と合わせて再評価                   |
| C: フラット + `tyousei-*` プレフィックス  | `tyousei-routes.ts` / `tyousei-views.tsx` / `tyousei-db.ts` / `tyousei-schema.ts` / `notifications.ts` を `src/` 直下に並べる | 既存 4 ファイルを撤去せず併存しつつ独立性を確保                                           | messageboard を完全撤去する方針なら接頭辞が冗長（アプリ全体が tyousei-san なので識別子としての価値が薄い） | 当初候補。messageboard 完全撤去の意思決定で **D 案へ更新** |
| **D: フラットなレイヤー分割（既存哲学）** | `index.tsx` / `routes.tsx` / `views.tsx` / `db.ts` / `schema.ts` / `notifications.ts` を `src/` 直下に並べる（接頭辞なし）    | structure.md の既存哲学そのまま、ファイル名検索でレイヤー単位に素直、命名のシグナルが最強 | アプリに第 2 ドメインが現れたら命名衝突を起こすため、その時点で Option B への昇格を検討する必要がある      | **採用**                                                   |

→ **Option D を採用**。messageboard 機能は完全撤去し、既存 4 ファイル（`index.tsx` / `views.tsx` / `db.ts` / `schema.ts`）の中身を tyousei のもので書き直す。新規追加は `routes.tsx`（既存 `index.tsx` のハンドラ部分を切り出して 9 ルートを束ねる Hono サブアプリ）と `notifications.ts`（Gemini + Slack ラッパ）の 2 ファイルのみ。`src/index.tsx` は「アプリ組み立て + `serveStatic` + テーマ + `app.route("/", routes)`」だけに痩せさせる。

---

## Design Decisions

### Decision: 採用ファイル分割戦略は Option D（フラットなレイヤー分割・接頭辞なし）

- **Context**: 要件 5.6-5.9 が messageboard を **残置しない** ことを明確に要求している（撤去前提）。messageboard が消えるなら、tyousei 用ファイルに `tyousei-*` 接頭辞を付ける理由（識別性）が消える。既存 structure.md は「フラットなレイヤー分割」を哲学として明示している
- **Alternatives Considered**:
  1. Option A: 既存ファイルへの追記（messageboard 残） — 要件 5.6-5.7 に違反
  2. Option B: `src/tyousei/` サブディレクトリ — 単一ドメインに対しては大袈裟
  3. Option C: `src/tyousei-*` プレフィックス — messageboard 完全撤去後はドメイン接頭辞が冗長
  4. Option D: フラットなレイヤー分割（接頭辞なし、既存哲学そのまま）
- **Selected Approach**: Option D。`src/index.tsx` / `routes.tsx` / `views.tsx` / `db.ts` / `schema.ts` / `notifications.ts` の 6 ファイルを `src/` 直下に並べる。既存 4 ファイル（`index.tsx` / `views.tsx` / `db.ts` / `schema.ts`）の中身は破棄して tyousei のもので書き直し、新規追加は `routes.tsx` と `notifications.ts` の 2 つのみ
- **Rationale**:
  - messageboard 完全撤去により、アプリ全体が tyousei-san の単一機能になる → 接頭辞は識別子としての価値を失う
  - structure.md の「フラットなレイヤー分割」哲学そのまま。新ルールを発明しない
  - ファイル数 6 は「フラットで把握可能」の範囲内
  - レイヤー名（`routes` / `views` / `db` / `schema`）でファイルを検索でき、命名のシグナルが最強
- **Trade-offs**:
  - ✅ structure.md の既存哲学に完全準拠（学習コストゼロ）
  - ✅ ファイル名が短くタイプしやすい、import 文も簡潔
  - ✅ 既存実装と差分が小さく、移行コスト最小（中身は書き直すが配置は同じ）
  - ❌ アプリに第 2 ドメインを追加する段階で命名衝突する → そのタイミングで Option B（サブディレクトリ化）へ昇格が必要
- **Follow-up**: 第 2 のドメイン spec を追加する段階で Option B（`src/tyousei/` / `src/<other>/`）への移行を再検討

### Decision: ID 生成は `crypto.randomUUID()`

- **Context**: 要件 1.6 で「推測困難」性が必要、依存追加最小化方針との両立
- **Alternatives Considered**:
  1. `nanoid` — 21 文字短く URL safe だが新規依存
  2. `crypto.randomUUID()` — Bun ネイティブ、依存ゼロ、36 文字
- **Selected Approach**: `crypto.randomUUID()` を採用
- **Rationale**: 依存最小化方針（steering tech.md）優先。URL 長は MVP の許容範囲
- **Trade-offs**: ✅ ゼロ依存・標準準拠 / ❌ URL がやや冗長
- **Follow-up**: ユーザビリティ上 URL 短縮が必要になったら nanoid 導入を再検討

### Decision: Alpine.js 統合方式は `htmx:afterSwap` + `Alpine.initTree`

- **Context**: 要件 10.4 が swap 後の Alpine 再初期化を要求
- **Alternatives Considered**:
  1. `alpine-morph` 拡張 — htmx 1.x 由来、本プロジェクトは htmx 2.x で適合外
  2. `htmx:afterSwap` リスナで `Alpine.initTree(target)` 呼び出し — 標準パターン
  3. Alpine の MutationObserver に任せる — CSP / `deferMutations` 設定下で動作不確実
- **Selected Approach**: 案 2 を採用。`Layout` 内に小さなインラインスクリプトで 1 行リスナを登録
- **Rationale**: 標準的・明示的・最小コード。Alpine 未読み込みでも `?.` ガードで安全
- **Trade-offs**: ✅ シンプル・予測可能 / ❌ インラインスクリプトが 1 つ増える（CSP 厳格化時に要調整）
- **Follow-up**: 将来 CSP を厳格化する場合は外部 JS ファイル化

### Decision: Gemini クライアントは `fetch` 直叩き（SDK 不採用）

- **Context**: 公式 SDK `@google/genai` を入れるか素の `fetch` でリクエストを構築するか
- **Alternatives Considered**:
  1. `@google/genai` SDK — 型補完が効くが新規依存
  2. `fetch` + 自前 zod schema パース — 依存ゼロ、必要最小限のみ実装
- **Selected Approach**: 案 2 を採用
- **Rationale**: 呼び出すエンドポイントは 1 つ、リクエスト/レスポンス形状もシンプル。依存最小化方針と整合。タイムアウトも `AbortSignal.timeout(5000)` で標準対応
- **Trade-offs**: ✅ 依存ゼロ・透明 / ❌ レスポンス形状を自前で型定義する必要あり（zod でパース）
- **Follow-up**: モデル切替や複雑な機能（streaming 等）が必要になったら SDK 移行

### Decision: クォータ枯渇フラグはモジュールレベルの可変フラグ（プロセス内 in-memory）

- **Context**: 要件 8.25 「同一プロセスの起動中はそれ以降の催促送信で Gemini API を呼び出さず」
- **Alternatives Considered**:
  1. モジュールレベル `let geminiQuotaExhausted = false;` — シンプル
  2. DB に永続化 — 再起動後も残るが、無料枠の RPD は日次リセットなので過剰
  3. `globalThis` に格納 — テストでリセット困難
- **Selected Approach**: 案 1。`notifications.ts` 内の `let` で管理し、`resetQuotaFlag()` を test ヘルパとして export
- **Rationale**: 要件は「同一プロセス起動中」を明示しており、再起動ごとにリセットされる仕様で十分
- **Trade-offs**: ✅ シンプル・テストしやすい / ❌ プロセス分散時には個別管理（本プロジェクトは単一プロセス）
- **Follow-up**: プロセスを複数化したら共有ストア（Redis 等）へ移行

---

## Risks & Mitigations

- **Risk: Gemini API レスポンス形状の変動でパースが落ちる**
  → zod でレスポンスをパースし、失敗時は **Tier 2** に落とす（要件 8.23 のパースエラー条件で吸収済み）
- **Risk: プロンプトインジェクションでイベントタイトルが指示文として解釈される**
  → タイトルをバッククォート 3 連で囲み、`systemInstruction` にユーザ入力を入れない（要件 8.15）
- **Risk: htmx swap 後に Alpine の状態が失われ UX が壊れる**
  → `htmx:afterSwap` で `initTree` 再呼び出しを必須化（要件 10.4 で明文化、Layout で配線）。フラグメント側に `x-data` を持たせるパターンを統一
- **Risk: Alpine.js が未読み込みでフラグメント内 `x-*` が動作しない**
  → 要件 10.8 のプログレッシブエンハンスメント。`x-cloak` + 初期表示は HTML 標準で成立する状態を保つ
- **Risk: 集計テーブルの DOM サイズが大きくなりレンダリングが重くなる**
  → MVP では候補数 × 参加者数の上限を緩く設定し、必要なら別 spec で仮想スクロール検討
- **Risk: Webhook URL の表示マスクが甘く、実 URL が漏れる**
  → サーバ側でマスク文字列を生成し、HTML に渡す前に変換（フロントで表示するのはマスク済みの文字列のみ）
- **Risk: テスト環境で Gemini / Slack を実呼び出ししてしまう**
  → プロセス外依存として **モック注入可能なクライアント関数** を切り出す。`notifications.ts` は `geminiClient` / `slackClient` を引数で受け取れる純関数として設計

---

## References

- [Rate limits | Gemini API | Google AI for Developers](https://ai.google.dev/gemini-api/docs/rate-limits) — Free tier の RPM/RPD と 429 形式
- [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing) — 課金プランと無料枠の境界
- [Alpine + HTMX discussion (alpinejs/alpine#2605)](https://github.com/alpinejs/alpine/discussions/2605) — `htmx:afterSwap` + `Alpine.initTree` の標準パターン
- [HTMX + Alpine.js Interoperability (Cursa)](https://cursa.app/en/page/htmx-and-alpine-js-interoperability-via-events-and-lifecycle-hooks) — ライフサイクルフックでの統合
- [Best practice for Alpine + HTMX + CSP (alpinejs/alpine#4478)](https://github.com/alpinejs/alpine/discussions/4478) — CSP 配下での初期化方式
- 既存リポジトリ: `src/index.tsx`, `src/views.tsx`, `src/db.ts`, `src/schema.ts`（実装パターンの正本）
- `.kiro/steering/{product,tech,structure}.md`（プロジェクト方針）
- `.kiro/specs/tyousei-san/gap-analysis.md`（要件 → 既存資産マップとオプション評価）
