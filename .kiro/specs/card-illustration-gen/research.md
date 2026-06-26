# Research & Design Decisions

---

## Summary

- **Feature**: `card-illustration-gen`
- **Discovery Scope**: Complex Integration（既存 `tyousei-ph2` カード機能の拡張 + 外部 Imagen API + Cloudflare R2 バインディング + 月次カウンタ永続化）
- **Key Findings**:
  - 本アプリは **2 ランタイム**で動く: Bun（`bun run dev` / `bun test`）と Cloudflare Workers（`wrangler deploy`、`src/worker.ts`）。R2 は Workers 専用バインディングで `c.env.CARD_ILLUSTRATIONS` からのみ参照でき、Bun / テストには存在しない。
  - Imagen 4 Fast の正式モデル ID は `imagen-4.0-fast-generate-001`。`@google/genai` v2.4 の `client.models.generateImages({ model, prompt, config: { numberOfImages, aspectRatio } })` で呼び、`response.generatedImages[0].image.imageBytes`（base64）からバイト列を得る。`aspectRatio: "3:4"` がサポートされる。
  - 既存テキストカード生成（`cards.ts` / `gemini.ts`）は POST ハンドラ内で **同期実行**され、`addResponseWithCard` で回答とカードを 1 トランザクションに永続化している。イラストもこの流れに乗せる。
  - `setCardGeneratorForTest` と同じ「プロセス外依存を setter で差し替える」運用が確立済み。イラスト生成器・画像ストレージも同パターンで差し替える。

## Research Log

### Imagen 4 Fast Generate を `@google/genai` で呼ぶ

- **Context**: 要件 1.2 が「Imagen 4 Fast Generate を `@google/genai` SDK 経由で 3:4 1 枚」と指定。既存 `gemini.ts` は同 SDK の `generateContent`（テキスト）のみ使用しており、画像生成 API の形を確認する必要があった。
- **Sources Consulted**:
  - [Generate images using Imagen | Gemini API](https://ai.google.dev/gemini-api/docs/imagen)
  - [ImageConfig | @google/genai](https://googleapis.github.io/js-genai/release_docs/interfaces/types.ImageConfig.html)
- **Findings**:
  - モデル ID: 標準 `imagen-4.0-generate-001` / Ultra `imagen-4.0-ultra-generate-001` / **Fast `imagen-4.0-fast-generate-001`**。
  - 呼び出し: `await client.models.generateImages({ model, prompt, config: { numberOfImages: 1, aspectRatio: "3:4" } })`。
  - レスポンス: `response.generatedImages[0].image.imageBytes` が **base64 文字列**。`Buffer.from(imageBytes, "base64")` でバイト化（Workers では `atob` / `Uint8Array` でも可）。
  - サポート aspectRatio: `1:1`(既定) / `3:4` / `4:3` / `9:16` / `16:9`。
  - 安全フィルタで拒否された場合は `generatedImages` が空（または該当要素なし）になりうる → 生成失敗として扱う（要件 6.4）。
- **Implications**: 新規モジュール `illustration.ts` に `defaultIllustrationGenerator`（`generate(card): Promise<Uint8Array>`）を実装。タイムアウトは `gemini.ts` と同じ `Promise.race` 方式。API キーは `GEMINI_API_KEY` 再利用（7.2）。403 はクォータ枯渇として以降抑止（4.2）。

### Cloudflare Workers の R2 バインディング参照（2 ランタイム整合）

- **Context**: 要件 2 / 7.7 が R2 保存と「R2 が無いローカル / テストでの絵文字フォールバック」を要求。`wrangler.toml` は `main = "src/worker.ts"`、`bun run dev` は `src/index.tsx` を起動する **二系統**。
- **Sources Consulted**: [Cloudflare Workers - Hono](https://hono.dev/docs/getting-started/cloudflare-workers) / [Bindings (env) · Cloudflare Workers](https://developers.cloudflare.com/workers/runtime-apis/bindings/)
- **Findings**:
  - R2 バインディングは `c.env.<BINDING>` から参照（`.put(key, body)` / `.get(key)`）。`new Hono<{ Bindings }>()` で型付けできる。
  - `process.env`（`GEMINI_API_KEY` 等）は `nodejs_compat` 下で Workers でも参照可。ただし R2 バインディングは `process.env` には載らず `c.env` のみ。
  - Bun ランタイムの `c.env` には R2 バインディングは存在しない（`undefined`）。
- **Implications**: ストレージはランタイム依存のため module シングルトンにできず、**リクエストごとに `c.env` から解決**する必要がある。`storage.ts` に `resolveImageStorage(env)` を置き、(1) テスト用 stub があればそれ、(2) `env.CARD_ILLUSTRATIONS` があれば R2 アダプタ、(3) Bun（dev）ならローカル FS アダプタ、(4) いずれでもなければ `null`（絵文字フォールバック）を返す。`@cloudflare/workers-types` を新規導入せず、使用メソッドだけの最小構造型を `storage.ts` に定義して `any` を避ける。

### 既存カード生成フローへの差し込み点

- **Context**: イラスト生成を「テキストカード Tier 1 成功時のみ・同一同期リクエスト・同一トランザクション」（1.1/1.5/1.6）で挿入する箇所の特定。
- **Sources Consulted（コード）**: `src/routes.tsx`（`POST /events/:id/responses` → `cardService.generateAndPersist`）/ `src/cards.ts`（3 段フォールバックと `addResponseWithCard`）/ `src/db.ts`（`addResponseWithCard` のトランザクション）/ `src/views.tsx`（`CardView` の `.yc-art-emoji`、`CardsCarousel`）。
- **Findings**:
  - `cardService.generateAndPersist(eventId, input)` が tier 確定後に `addResponseWithCard` を呼ぶ。ここに「tier==="ai" のときイラスト生成 → R2 保存 → key を持って永続化」を足せる。
  - `addResponseWithCard` のトランザクションに `illustrationKey` 挿入と月次カウンタ +1 を同梱できる。
  - `CardView` は `card: PersistedCard` のみ受け取り `eventId` を知らない。スコープ付き GET ルート URL 生成のため `eventId` を `CardsCarousel` → `CardView` に渡す必要がある。
- **Implications**: `cardService.generateAndPersist` の引数に解決済み `imageStorage`（`c.env` 由来）を追加。`PersistedCard` / `participant_cards` に `illustrationKey`（nullable）を追加。`CardsCarousel` に `eventId` prop を追加。

## Architecture Pattern Evaluation

| Option                                       | Description                                           | Strengths                                                                | Risks / Limitations                                                       | Notes                                             |
| -------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------- |
| 同期インライン生成（採用）                   | 既存 `cardService` 内で Imagen→R2→永続化を同期実行    | 要件 1.5/1.6 に直結、既存フローを踏襲、追加インフラ不要                  | 回答送信が最大 ~30s ブロックしうる                                        | 要件が同期を明示。タイムアウト 30s で上限         |
| 非同期ジョブ（Queue 等）                     | 生成を Workers Queue に逃がし後で埋める               | 送信が速い                                                               | 要件 1.5（同期）違反、Queue インフラ追加、カルーセルに pending 状態恒久化 | 不採用                                            |
| キー方式: UUID（採用）                       | `cards/{uuid}.png` を card 行に保存                   | 生成前にキー確定でき短いトランザクション、公開ページで他者キー列挙を防止 | キー自体は responseId を直接表さない（card 行経由で 1:1）                 | 2.4「response ごとに一意」を card 行 1:1 で満たす |
| キー方式: responseId 2 段                    | 先に insert→responseId 採番→後で key 更新             | キーが規則的                                                             | カード永続化が 2 トランザクションに分かれ 1.6 とずれる                    | 不採用                                            |
| ストレージ抽象: ランタイム解決ポート（採用） | `resolveImageStorage(c.env)` で R2 / FS / stub / null | 2 ランタイム・テスト・dev を 1 インターフェースで吸収                    | 解決ロジックの分岐を要テスト                                              | 7.3/7.6/7.7 を一括充足                            |

## Design Decisions

### Decision: イラスト生成・保存・永続化の実行順とトランザクション境界

- **Context**: 1.6（カードと同一トランザクションで永続化）/ 8.4（R2 保存完了後に +1）/ 30s かかりうる Imagen 呼び出しを SQLite 書込トランザクション内に入れたくない。
- **Selected Approach**: (1) テキストカード 3 段確定 → (2) tier==="ai" かつ storage!=null かつ未枯渇かつ当月 < 上限のとき Imagen 生成 → (3) `cards/{uuid}.png` を R2/FS に put → (4) **DB トランザクション**で response + card(+illustrationKey) を insert し、key があれば月次カウンタを同トランザクションで +1。
- **Rationale**: 重い外部呼び出しをトランザクション外に出しつつ、DB 側の「カード行 + キー + カウンタ」は原子的。R2 put 失敗時はキー null で commit（絵文字）。
- **Trade-offs**: トランザクション後ではなく前に R2 put するため、稀に DB ロールバック時 R2 オブジェクトが孤児化しうる（クリーンアップはスコープ外、低頻度で許容）。
- **Follow-up**: 孤児オブジェクトの扱いは運用課題として記録（本スペックでは未対応）。

### Decision: 月次上限はベストエフォート

- **Context**: 8.1–8.6。Workers は同時実行があり「読取→生成→+1」は TOCTOU で僅かに超過しうる。
- **Selected Approach**: 生成前に当月カウントを読み、上限未満なら生成。R2 保存成功後にトランザクション内で +1（upsert）。原子的予約はしない。
- **Rationale**: 低トラフィックの調整さん系アプリで 50/月のコスト上限に対し数枚の超過は実害が小さく、実装が単純（ユーザー判断: ベストエフォート）。
- **Trade-offs**: 厳密な上限保証はない。
- **Follow-up**: 超過が問題化したら原子的条件付き UPDATE（`WHERE count < limit`）へ差し替え可能な設計に留める。

### Decision: ローカル開発はファイルシステムアダプタ

- **Context**: 7.7。`bun run dev` は R2 バインディングを持たない。
- **Selected Approach**: Bun ランタイムでは `node:fs` ベースのローカルアダプタ（既定ディレクトリ `.local-illustrations/`）に保存・読出し、dev でもイラスト表示を確認可能にする（ユーザー判断）。書込/読出失敗時は絵文字にフォールバック。
- **Rationale**: dev での体験確認を可能にしつつ、本番（R2）・テスト（in-memory stub）と同一ポートで吸収。
- **Trade-offs**: dev 専用ディレクトリが生成される（`.gitignore` 追加が必要）。
- **Follow-up**: `.gitignore` に `.local-illustrations/` を追加。

### Decision: 配信は既存階層にスコープした GET ルート

- **Context**: 2.5/2.6。
- **Selected Approach**: `GET /events/:id/responses/:responseId/illustration`。responseId から card 行を引き illustration_key を取得し、解決済みストレージで `get(key)` して `image/png` を返す。key 無しは 404。
- **Rationale**: 既存ルート階層（`/events/:id/responses/:responseId/...`）と一貫し所有権が明確（ユーザー判断）。`CardView` の `<img src>` はこの URL を responseId/eventId から導出。
- **Trade-offs**: GET ごとに card 行 1 件の lookup が増えるが軽微。

## Risks & Mitigations

- Imagen 呼び出しで回答送信が最大 30s ブロック — タイムアウト既定 30s（`IMAGEN_TIMEOUT_MS`）、失敗時即絵文字（4.6/4.1）。
- R2 孤児オブジェクト（DB ロールバック時）— 低頻度・スコープ外として記録。
- `c.env` 型に R2 型が無く `any` 化の懸念 — `storage.ts` に最小構造型を自前定義し型安全を維持。
- 2 ランタイム差異でテストが実 R2/Imagen に依存 — `resolveImageStorage` の stub 経路と `setIllustrationGeneratorForTest` で完全差し替え（7.3/7.6）。

## References

- [Generate images using Imagen | Gemini API](https://ai.google.dev/gemini-api/docs/imagen) — Imagen 4 Fast モデル ID・レスポンス形・aspectRatio
- [ImageConfig | @google/genai](https://googleapis.github.io/js-genai/release_docs/interfaces/types.ImageConfig.html) — generateImages config
- [Cloudflare Workers - Hono](https://hono.dev/docs/getting-started/cloudflare-workers) — R2 バインディング参照
- [Bindings (env) · Cloudflare Workers](https://developers.cloudflare.com/workers/runtime-apis/bindings/) — env バインディング
