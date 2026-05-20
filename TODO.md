# TODO（ユーザー操作が必要な作業）

本機能（tyousei-ph2 / 参加者カード拡張）を **実際に動作** させるためにユーザー（開発者）側で行うべき手順をまとめる。
コード側のセットアップ（`@google/genai` の依存追加、`.env.example` の雛形追記）は task 1.1 で完了済み。

> 未実施でもアプリ自体は起動する。Gemini API キーが未設定の場合は常に Tier 3（最低限デフォルト）でカードが生成される。

## いつやればよいか

- **残タスク（1.2 〜 4.1）の TDD 実装中は不要**。`bun test` / `bun run test:e2e` は全テストで `setCardGeneratorForTest(stub)` または `GEMINI_TEST_STUB` により Gemini API を呼ばないため、API キーなしで完走できる（design.md §5 準拠）
- **必要になるタイミング**: すべての実装完了後にローカル `bun run dev` で実際の Gemini を叩いて Tier 1（AI 生成）の体験を確認したいとき
- **CI セットアップは不要**: `GEMINI_API_KEY` のシークレット登録も `.env.test` への記載も不要

---

## 1. Gemini API キーの取得（必須相当）

- [ ] [Google AI Studio](https://aistudio.google.com/app/apikey) に Google アカウントでログインする
- [ ] 「Create API key」から **無料枠** の API キーを発行する
- [ ] 発行されたキー文字列を控える（再表示できない場合があるため）
  - Google Cloud のプロジェクト紐付けは **任意**。無料枠運用の範囲ではプロジェクトなしで利用可能

## 2. `.env` への記載

ローカルの `.env`（git 管理外）に以下を追記する。`.env.example` には既に雛形コメントが入っているのでコピペで OK。

```env
# 必須相当（未設定だと常に Tier 3 固定）
GEMINI_API_KEY=<手順 1 で取得したキー>

# 任意（未設定ならデフォルト値が使われる）
# GEMINI_MODEL=gemini-2.0-flash
# GEMINI_TIMEOUT_MS=4000
# GEMINI_TEMPERATURE=0.9
# GEMINI_MAX_OUTPUT_TOKENS=256

# 起動時の疎通確認を有効化したい場合のみ（無料枠を 1 回消費する）
# GEMINI_VERIFY_ON_BOOT=1
```

- [ ] `.env` に `GEMINI_API_KEY` を追加する
- [ ] `.env` が `.gitignore` に含まれていることを確認する（API キーをコミットしないため）

## 3. 疎通確認（任意）

- [ ] `GEMINI_VERIFY_ON_BOOT=1` を `.env` に設定して `bun run dev` を 1 回起動し、`console.info` で `verify connectivity: ok` 等が出ることを確認する（後続タスク 3.3 で実装予定）
- [ ] 確認後は `GEMINI_VERIFY_ON_BOOT` をコメントアウトして無料枠の消費を抑える（ホットリロード対策）

---

## やらなくてよいこと

- **テスト実行時の API キー設定は不要**。`bun test` / `bun run test:e2e` は内蔵スタブに差し替わるため Gemini API を呼ばない（`.env.test` への記載も不要）
- **CI への `GEMINI_API_KEY` シークレット登録も不要**
- **課金設定は不要**。本機能は無料枠運用前提
