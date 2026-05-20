# Implementation Plan — tyousei-ph2（参加者カード拡張）

> 本タスクリストは `design.md` の File Structure Plan / Components and Interfaces / Migration Strategy に整合する。各タスクの実装は `.claude/skills/tdd-workflow/SKILL.md` の TDD ワークフロー（Phase 1–4 を `Agent` ツールで起動）に従い、`bun test` の単体 / 統合と `bun run test:e2e` の Playwright を併用する。

## 1. Foundation: 依存とスキーマ

- [x] 1.1 Gemini SDK 依存と環境変数雛形の導入
  - `@google/genai` を本番依存に追加する
  - `.env.example` に Gemini 系の環境変数（`GEMINI_API_KEY` / `GEMINI_MODEL` / `GEMINI_TIMEOUT_MS` / `GEMINI_TEMPERATURE` / `GEMINI_MAX_OUTPUT_TOKENS` / `GEMINI_VERIFY_ON_BOOT`）の雛形コメントを追記する
  - 既存テストが緑のまま、`bun install` が成功し `package.json` に `@google/genai` が記録される
  - _Requirements: 7.5_

- [x] 1.2 参加者カードテーブルとマイグレーションを追加
  - スキーマに `participant_cards`（`response_id` を主キー兼 `event_responses.id` への外部キー、`ON DELETE CASCADE`、7 属性 + `tier` + `created_at`）を追加する
  - 既存 4 テーブル（events / event_options / event_responses / event_option_responses）は **一切変更しない**
  - `bun run db:gen` でマイグレーション SQL を生成し、起動時自動マイグレーションで適用されることを確認する
  - 起動後にローカル DB（`local.db` / メモリ）で `participant_cards` テーブルが 1:1 制約付きで存在する
  - _Requirements: 1.2, 1.3, 5.1, 5.2_

## 2. Core: Adapter / Repository / Service

- [x] 2.1 (P) Gemini Adapter（プロセス外依存ラッパ）の実装
  - 参加者名を構造境界（`<participant_name>...</participant_name>`）で囲むプロンプト生成と、推奨候補（UR/SR/R/N、光/闇/水/風/地/火、戦士/ドラゴン 他）の明示
  - `responseMimeType: "application/json"` と `responseSchema`（7 属性 required）で構造化出力を強制する
  - 結果分類: `403` のみクォータ枯渇エラーとしてプロセス内フラグを立て、以降の生成を即時失敗にする。`429` 単発・タイムアウト・5xx・JSON 不正・スキーマ不一致は一過性エラーとして区別する
  - 起動時オプトイン疎通確認用の関数（最小 1 トークン規模の生成で `ok: true` / 失敗理由を返す）を提供する
  - テスト用差し替え機構（生成器スタブを差し込むための setter）と、クォータフラグのリセット手段を export する
  - 単体テストでは `@google/genai` SDK を実 API に届かないようローカル `fetch` モックまたはアダプタ境界で遮断し、403 / 429 / timeout / 二回目以降の抑止を検証する
  - **観察可能な完了条件**: `bun test` の Adapter テストが全件 pass し、クォータ枯渇後に再度生成を試みても実 API が呼ばれないことを検証できる
  - _Requirements: 4.1, 4.3, 4.5, 4.8, 7.1, 7.2, 7.3, 7.5_
  - _Boundary: gemini.ts_

- [x] 2.2 (P) Repository の拡張: 同一トランザクション書き込みとカード結合読み出し
  - 「回答 + 候補別回答 + 参加者カード」を 1 つのトランザクションで一括書き込みする関数を追加する（既存 `addResponse` は当面残置）
  - 既存の取得関数（イベント + 候補 + 回答 + 集計）の返却型を、各回答に `card: 参加者カード | null` の追加プロパティを持つ交差型に拡張する
  - 既存 `ResponsesTable` の Props 互換性を壊さないため、新規型は追加プロパティを **付け足す** 形にする（旧 Props 受け取り側は無視できる）
  - 既存テーブルの ORDER BY（`event_responses.id ASC`）はそのまま保持し、カードが回答送信順に並ぶ前提を維持する
  - 実 DB（in-memory）に対するテストで、書き込みのアトミック性とカード結合読み出しを検証する
  - **観察可能な完了条件**: トランザクション書き込み関数を呼ぶと回答 + カードが 1 件ずつ追加され、取得関数の戻り値で `responses[i].card` を取り出せる
  - _Requirements: 5.3, 5.4_
  - _Boundary: schema.ts, db.ts_

- [x] 2.3 Card Service: 3 段フォールバックとサニタイズの実装
  - Tier 判定: Adapter 成功 → AI（Tier 1）、一過性エラー（タイムアウト / 5xx / JSON 不正 / スキーマ不一致 / 単発 429）→ テンプレート（Tier 2）、クォータ枯渇 → 最低限デフォルト（Tier 3）
  - 二つ名サニタイズ: 参加者名が含まれない応答の場合は末尾に名前を必ず付与する
  - フレーバーサニタイズ: 改行・制御文字を半角スペースに置換する
  - 文字列クランプ: 二つ名 / レアリティ / 属性 / 種族 / フレーバーを上限文字数で切り詰める
  - 数値クランプ: 攻撃力 / 守備力を 0 以上、上限値以内に丸める
  - Tier 2 テンプレ: 名前のハッシュで決定論的に二つ名と属性候補を抽選する（最低 8 件の二つ名テンプレを持ち、同じ参加者には同じテンプレが当たる）
  - Tier 3 既定値: 二つ名は名前のみ、他属性は最低限定数
  - AI 呼び出しは **トランザクション外**、永続化は Repository 経由のトランザクション内で実施する
  - いずれの Tier でも例外を呼び出し元に伝播させず、必ず永続化済みカードを返す
  - 単体テストでは Adapter スタブを差し替えて Tier 1/2/3 全経路、サニタイズ、クランプを検証する
  - **観察可能な完了条件**: いずれの Tier 経路でも参加者カードが 1 件永続化され、二つ名に参加者名が必ず含まれ、攻撃力 / 守備力が 0 以上上限以内に収まる
  - _Depends: 2.1, 2.2_
  - _Requirements: 1.1, 1.5, 1.6, 4.1, 4.2, 4.3, 4.4, 4.6, 4.7, 7.2, 7.4_

## 3. Integration: Controller / Presentation / 起動シーケンス

- [ ] 3.1 (P) 回答送信ハンドラを Card Service に結線し 2 領域フラグメントを返す
  - 新規回答送信経路（POST）で Card Service を呼び、回答 + カードを同一トランザクションで永続化する
  - レスポンスは「`#responses` の差し替えフラグメント」+「`#cards` の Out-of-Band フラグメント（`hx-swap-oob`）」を同一 HTTP レスポンスに同梱する
  - 編集経路（PUT）はカードを再生成せず、既存カード集合を `#cards` に再送するだけにする
  - 既存の `hx-target="#responses"` フォーム属性・既存 422 / 404 経路・既存の多重送信抑止（`hx-on::after-request="this.reset()"`）は無改変
  - 統合テストで、新規送信後にフラグメント内に `#responses` と `#cards`（`hx-swap-oob`）が両方含まれること、編集後にカード行が変化しないことを検証する
  - **観察可能な完了条件**: `bun test` の Controller テストが、POST 後に参加者カード 1 件追加 + `#cards` フラグメント返却、PUT 後にカード集合不変を検証して pass する
  - _Depends: 2.3_
  - _Requirements: 1.1, 1.4, 2.4, 6.1, 6.2, 6.4_
  - _Boundary: routes.tsx_

- [ ] 3.2 (P) カルーセル UI とカードビューを追加し EventPage に組み込む
  - カルーセル: 回答 0 件時は表示しない（または空状態メッセージ）、1 件以上で各カードを送信順に横並び表示、横スクロール / スワイプ可能（`overflow-x: auto`）
  - カードビュー: 7 属性すべてを視覚的に提示。レアリティで枠装飾を切替。属性をバッジ表示。種族を文字列で表示。`ATK / DEF` 風の数値ペア。イラスト枠なし
  - 色は pico.css の `--pico-*` CSS 変数を参照し、ライト / ダーク両テーマで視認可能にする
  - スクリーンリーダー向けに、各カードに二つ名 + 参加者名を含むラベルを付与する
  - カード未紐付け（万一の null）時は「カードを生成中…」相当のフォールバック表示
  - イベント詳細ページ（フルページ初回 GET）の DOM 順序を「カルーセル（`#cards`）→ 候補一覧 / 回答テーブル（`#responses`）→ 回答フォーム」に並べ替える
  - 必要最小限のカード装飾 CSS を `public/app.css` に追記する
  - 統合テストで、フルページ GET 時にカルーセル領域が描画されることを検証する
  - **観察可能な完了条件**: 回答 1 件以上のイベント詳細ページで、`#cards` 領域にレアリティ別の class が付いたカードが回答送信順に描画される
  - _Depends: 2.2_
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 5.5, 6.3, 6.5_
  - _Boundary: views.tsx, public/app.css_

- [ ] 3.3 (P) 起動時の Gemini 疎通確認をオプトインで追加
  - アプリ起動シーケンスに、環境変数 `GEMINI_VERIFY_ON_BOOT === "1"` のときだけ Adapter の疎通確認関数を 1 回呼ぶ薄いフックを追加する
  - 確認結果を `console.info` / `console.warn` に 1 行出すだけで、失敗してもアプリ起動は止めない
  - デフォルト（環境変数未設定）では実 API リクエストを一切発生させず、`bun run dev --hot` のホットリロードで無料枠を消費しない
  - **観察可能な完了条件**: `GEMINI_VERIFY_ON_BOOT=1` で起動すると疎通結果が console に出力され、未設定で起動すると Gemini 関連の HTTP リクエストが発生しない（ローカル観察）
  - _Depends: 2.1_
  - _Requirements: 7.5_
  - _Boundary: index.tsx_

## 4. Validation: E2E スナップショット

- [ ] 4.1 参加者カード E2E スペックを 3 シナリオ追加
  - 専用ファイル `tests/e2e/cards.spec.ts` を新設し、`test.beforeEach` で既存ヘルパの `truncateAll()` を呼ぶ
  - シナリオ 1（ハッピーパス）: 回答送信後に上部カルーセル領域（`#cards`）に新しいカードが追加され、`#responses` も同時に更新される
  - シナリオ 2（ハッピーパス）: 既存回答を編集してもカード集合（DOM 上のカード数 / 内容）が変化しない
  - シナリオ 3（異常系 / Tier 3）: AI を呼ばないスタブ状態（`GEMINI_TEST_STUB=tier3`）でも回答送信が 200 で完了し、回答 + カードの両方が永続化される
  - `playwright.config.ts` の `webServer.env` 経由でテスト用スタブ切替フラグを渡し、サーバ側で内蔵スタブに差し替える（Adapter 差し替え機構を流用、実 Gemini API は呼ばない）
  - 実装挙動のスナップショット型で記述する（要件遵守は単体 / 統合側で担保済み）
  - **観察可能な完了条件**: `bun run test:e2e` を headless 実行すると、追加した 3 シナリオが全件 pass する
  - _Depends: 3.1, 3.2_
  - _Requirements: 1.4, 2.1, 2.4, 4.3, 4.4, 6.1, 6.2, 6.3_
