# Requirements Document

## Project Description (Input)

tyousei-san

日本で広く使われているスケジュール調整ツール「調整さん」相当の最小機能を、本リポジトリの Bun + Hono + htmx + Drizzle + pico.css スタックで実装する。イベント作成者が候補日時を並べたページを作り、URL を共有された参加者が各候補に対して「○ / △ / ×」で出欠を回答し、集計が一覧に反映されるまでをスコープとする。

**プラスアルファ機能（差別化要素）:** 本実装では本家「調整さん」にはない **任意のカスタム設問 1 件** を主催者が追加できる。例: 「お酒飲めますか？」「アレルギーの食品は？」「持ち物の希望」など。参加者は出欠回答と同時にこの設問にも自由記述で回答する。設問は 1 件までに制限し、UI と実装をシンプルに保つ。

## Introduction

本アプリは、サーバーレンダリング + htmx 構成の単一機能 Web アプリとして「調整さん」相当の出欠調整を提供する（検証用に存在していたメッセージボード等の別機能は撤去し、本仕様の対象外とする）。イベントごとに一意な URL を発行し、認証なしで誰でも回答・閲覧できる。投稿は htmx の部分更新で集計表が即時反映され、フォームは入力値を保持しながら継続入力できる。バリデーションエラーはフラグメント差し戻しで再描画し、入力途中の値を失わない。

データは libsql（ローカルは file-backed SQLite、本番は Turso）に永続化し、マイグレーションは起動時に自動適用する。クライアント JS は **htmx を主軸**に据え、タブ・モーダル等のクライアント側状態管理が必要な箇所のみ **Alpine.js** を補助的に併用する（重量級の SPA フレームワークは導入しない）。

## Boundary Context

- **In scope**:
  - イベント作成（タイトル + 候補日時複数 + 任意のカスタム設問 1 件）
  - イベント閲覧 URL の発行と表示
  - 参加者ごとの回答登録（名前 + 各候補に対する ○ / △ / × + カスタム設問への自由記述）
  - 既存参加者の回答更新（カスタム設問への回答も含む）
  - 候補ごとの ○ / △ / × 集計表示
  - カスタム設問への参加者全員の回答一覧表示
  - 入力バリデーションとエラー再描画
  - 空状態（参加者 0 名 / 候補 0 件）の表示
  - Slack Incoming Webhook URL の手動登録（複数）と DB 永続化
  - イベントページから Webhook を選んで手動で催促メッセージを送信
  - 催促メッセージ本文を **Gemini API（無料枠の軽量モデル、例: `gemini-flash-lite`）で都度動的生成**
  - **3 段階フォールバック戦略**: Tier 1 = Gemini 生成 / Tier 2 = 一時的失敗時はテンプレートからランダム選択 / Tier 3 = 無料枠枯渇（429 / 403）時は文章生成を一切行わず「タイトル + URL」のみの最低限メッセージ
  - 無料枠枯渇検知後はプロセス内で Gemini 呼び出しを停止し、追加の API リクエストを抑止
- **Out of scope**:
  - ユーザー認証・アカウント管理（誰でも回答可能）
  - イベント / 参加者の削除機能
  - コメント機能
  - メール通知 / その他チャットツール（LINE / Discord / Teams 等）
  - スケジュール送信・自動催促（cron 等）
  - 未回答者の特定・限定送信（Slack ユーザー紐付けは行わない）
  - アクセス制御・パスワード保護
  - 国際化（日本語のみ）
  - イベント検索・一覧ページ（URL を直接知っている人のみアクセス）
  - カスタム設問の複数追加（1 件までに制限）
  - カスタム設問の回答形式選択（自由記述のみ。ラジオボタン / チェックボックス / 数値入力等は対応しない）
  - カスタム設問の事後編集（イベント作成後の設問文・有無の変更）
  - Slack Webhook の OAuth による自動取得（手動登録のみ）
  - Slack 催促メッセージ本文のユーザー編集・プレビュー（送信前に内容を確認・編集する UI は持たない）
  - Gemini API のレスポンスのキャッシュ・履歴保存（毎回新しく生成し、送信後は破棄）
  - Gemini API の有料枠 / プロジェクト課金設定（無料枠の Rate Limit 内での運用を前提とする）
- **Adjacent expectations**:
  - 本リポジトリは **tyousei-san（出欠調整 + Webhook + 催促）のみ** をプロダクトコードとして持つ。過去の検証用機能（メッセージボード等）のルート・テーブル・ビューは残置しない
  - `src/db.ts` は単一 libsql クライアントと起動時マイグレーションを維持する
  - 「初回 GET はフルページ / htmx 経由はフラグメント」の規約を遵守する

## Requirements

### Requirement 1: イベント作成

**Objective:** As an イベント主催者, I want タイトル・複数の候補日時・任意のカスタム設問 1 件を入力してイベントを作成できる, so that 参加者と共有する調整ページを発行できる

#### Acceptance Criteria

1. When 主催者が `GET /events/new` にアクセスしたとき、the Event Service shall タイトル入力欄、候補日時を複数追加できるフォーム、カスタム設問の入力欄（任意）を含むフルページを返す
2. When 主催者が有効なタイトルと 1 件以上の候補日時を持つフォームを `POST /events` に送信したとき、the Event Service shall 新しいイベントレコードを永続化し、発行されたイベント URL（`/events/:id`）へリダイレクトする
3. If タイトルが空文字または空白のみであるとき、then the Event Service shall HX-Retarget でフォームに差し戻し、入力値を保持したままバリデーションエラーを表示する
4. If 候補日時が 1 件も指定されていないとき、then the Event Service shall HX-Retarget でフォームに差し戻し、「候補日時を 1 件以上入力してください」というエラーを表示する
5. If 候補日時の文字列が空または重複しているとき、then the Event Service shall 該当候補に対するバリデーションエラーをフォームに差し戻して表示する
6. The Event Service shall イベントごとに一意な ID を生成し、推測困難な文字列で URL を構成する
7. Where カスタム設問の入力欄に文字列が入力されているとき、the Event Service shall 当該文字列をイベントのカスタム設問文として永続化する
8. Where カスタム設問の入力欄が空（空文字または空白のみ）のとき、the Event Service shall カスタム設問なしのイベントとして永続化する
9. If カスタム設問文が 200 文字を超えているとき、then the Event Service shall HX-Retarget でフォームに差し戻し、「設問は 200 文字以内で入力してください」というエラーを表示する

### Requirement 2: イベント閲覧と集計表示

**Objective:** As a 参加者または主催者, I want イベント URL から候補日時と全参加者の回答状況、カスタム設問への回答を一覧で確認できる, so that 全員の予定が合う候補を判断し、設問への回答も把握できる

#### Acceptance Criteria

1. When 利用者が `GET /events/:id` にアクセスしたとき、the Event Service shall イベントのタイトル、候補日時一覧、参加者ごとの回答行、候補ごとの集計行を含むフルページを返す
2. When 利用者が存在しないイベント ID にアクセスしたとき、the Event Service shall 404 ステータスと「イベントが見つかりません」というページを返す
3. While 参加者が 0 名であるとき、the Event Service shall 「まだ回答がありません」という空状態メッセージと、回答フォームのみを表示する
4. The Event Service shall 候補日時ごとに ○ / △ / × の人数を集計して表示する
5. The Event Service shall 参加者を登録順（古い順）に表示する
6. Where イベントにカスタム設問が設定されているとき、the Event Service shall 各参加者行にカスタム設問への回答列を追加して表示する
7. Where イベントにカスタム設問が設定されていないとき、the Event Service shall カスタム設問列を一切表示しない

### Requirement 3: 参加者の回答登録

**Objective:** As a 参加者, I want 名前・各候補日時に対する出欠（○ / △ / ×）・カスタム設問への回答を入力して回答できる, so that 主催者と他の参加者に自分の予定と設問への回答を共有できる

#### Acceptance Criteria

1. When 参加者が名前と全候補に対する回答を `POST /events/:id/responses` に送信したとき、the Event Service shall 参加者と回答を永続化し、更新後の集計表フラグメントだけを返して htmx が `#responses` に差し替える
2. If 名前が空文字または空白のみであるとき、then the Event Service shall HX-Retarget で回答フォームに差し戻し、入力値を保持したままバリデーションエラーを表示する
3. If いずれかの候補に対する回答が ○ / △ / × 以外の値であるとき、then the Event Service shall バリデーションエラーをフォームに差し戻して表示する
4. If 回答対象のイベントが存在しないとき、then the Event Service shall 404 ステータスを返す
5. When 同じイベント内で同名の参加者が既に存在する状態で新規回答が送信されたとき、the Event Service shall 別の参加者として登録する（同名重複を許容する）
6. The Event Service shall 各候補に対する回答を ○ / △ / × の 3 値に限定する
7. Where イベントにカスタム設問が設定されているとき、the Event Service shall 回答フォームにカスタム設問の自由記述入力欄を表示する
8. Where イベントにカスタム設問が設定されているとき、the Event Service shall 参加者の自由記述回答（空文字含む）を当該参加者に紐づけて永続化する
9. If カスタム設問への回答が 500 文字を超えているとき、then the Event Service shall HX-Retarget で回答フォームに差し戻し、「設問への回答は 500 文字以内で入力してください」というエラーを表示する
10. Where イベントにカスタム設問が設定されていないとき、the Event Service shall 回答フォームにカスタム設問の入力欄を表示しない

### Requirement 4: 既存参加者の回答更新

**Objective:** As a 既存参加者, I want 自分の以前の回答（出欠とカスタム設問への回答）を編集できる, so that 予定変更や設問への回答の修正があっても再入力できる

#### Acceptance Criteria

1. When 参加者が自分の参加者行の編集ボタンを押したとき、the Event Service shall 該当行を編集可能なフォームフラグメントに差し替える
2. When 編集された回答が `PUT /events/:id/responses/:responseId` に送信されたとき、the Event Service shall 該当参加者の回答を上書きし、更新後の集計表フラグメントだけを返して htmx が `#responses` に差し替える
3. If 編集対象の参加者 ID が当該イベントに紐づかないとき、then the Event Service shall 404 ステータスを返す
4. The Event Service shall 編集中に名前・各候補への回答・カスタム設問への回答のバリデーションを新規登録時と同じルールで実施する
5. Where イベントにカスタム設問が設定されているとき、the Event Service shall 編集フォームに既存のカスタム設問への回答を初期値として表示する

### Requirement 5: htmx 規約とレイヤ責務（単一アプリ）

**Objective:** As a 開発者, I want 「フルページ vs フラグメント」規約とレイヤ分離が一貫した単一出欠調整アプリとして保守できる, so that コードの見通しが良く、拡張やテストが容易である

#### Acceptance Criteria

1. When 利用者が `GET /events/new` または `GET /events/:id` または `GET /webhooks` を要求したとき、the Application shall `<Layout>` を含むフルページ HTML を返す
2. When htmx 経由で回答登録 / 編集 / Webhook 登録 / 催促などのミューテーションが送信されたとき、the Application shall `<html>` を含まない該当フラグメントだけを返す（フルページを返すエンドポイントと混同しない）
3. The Application shall ビューコンポーネント（`views.tsx` の FC）から DB 関数や Hono `Context` を import しない
4. The Application shall データアクセス関数を `src/db.ts` に集約し、ハンドラからは関数経由で呼び出す
5. The Application shall 入力バリデーションを `zValidator` ベースで実装し、ハンドラ内に手書きの型ガードを増やさない
6. The Application shall コードベースにメッセージボード用のルート・テーブル・コンポーネント（例: `/messages`、`messages` テーブル、`MessageList` 等）を含めない
7. The Application shall `src/schema.ts` に定義する Drizzle テーブルは、本アプリのドメイン（イベント・回答・Webhook 等）のみとする
8. The Application shall `Layout` をアプリ全体で共有するシェル（htmx / Alpine.js / pico.css の読み込みを含む）として定義する
9. When 利用者が `GET /` にアクセスしたとき、the Application shall `/events/new` への HTTP リダイレクト（3xx）を返すか、イベント作成への導線を含むフルページを返す（調整機能がルート未設定で利用不能にならないこと）

### Requirement 6: 永続化とスキーマ

**Objective:** As a 開発者, I want イベント・候補日時・参加者・回答・カスタム設問への回答が Drizzle スキーマで定義され起動時マイグレーションで反映される, so that ローカル / 本番で同じ構成のまま動かせる

#### Acceptance Criteria

1. The Event Service shall `events`, `event_options`, `event_responses` 相当のテーブルを `src/schema.ts` に定義する
2. When `bun run db:generate` を実行したとき、the Migration Toolchain shall `drizzle/` 配下に新規 SQL マイグレーションファイルを出力する
3. When サーバーが起動したとき、the Application shall 未適用の `drizzle/` 配下マイグレーションを自動適用する
4. The Event Service shall 候補削除時に紐づく回答も削除されるよう外部キー / カスケードを設定する
5. The Event Service shall TypeScript の型を `typeof xxx.$inferSelect` でスキーマから導出し、ハンドコードしない
6. The Event Service shall `events` テーブルにカスタム設問文を保持する nullable な列（例: `custom_question`）を持たせる
7. The Event Service shall 参加者のカスタム設問への回答を `event_responses`（参加者）テーブル側に保持する（候補ごとの回答とは別カラム）
8. The Event Service shall Slack Incoming Webhook URL を保持する `slack_webhooks` 相当のテーブルを定義する（最低でも `id` / `label` / `url` / `created_at` を持つ）

### Requirement 7: カスタム設問機能（プラスアルファ）

**Objective:** As an イベント主催者, I want 出欠以外の任意の設問を 1 件追加して参加者全員に回答してもらえる, so that 「お酒が飲めるか」「アレルギー食品」など出欠と一緒に確認したい情報を集約できる

#### Acceptance Criteria

1. The Event Service shall 1 イベントにつきカスタム設問を最大 1 件まで保持する
2. The Event Service shall カスタム設問の回答形式を自由記述（プレーンテキスト）に限定する
3. Where イベントにカスタム設問が設定されているとき、the Event Service shall イベント閲覧ページに設問文を見出しとして表示する
4. Where イベントにカスタム設問が設定されているとき、the Event Service shall 全参加者の自由記述回答を一覧で閲覧可能に表示する
5. The Event Service shall カスタム設問文の長さを 1〜200 文字に制限する
6. The Event Service shall カスタム設問への回答（自由記述）を 0〜500 文字に制限する（空文字は許容）
7. The Event Service shall カスタム設問のテキストを HTML エスケープして表示し、XSS を防止する

### Requirement 8: Slack 催促通知

**Objective:** As an イベント主催者, I want 登録済みの Slack チャンネル（複数）から 1 つを選んで、思わずクリックしたくなる小粋な文章でイベント URL を投稿できる, so that 参加者の回答を促進し、イベント調整を加速できる

#### Acceptance Criteria

##### Webhook 登録 / 一覧

1. When 利用者が `GET /webhooks` にアクセスしたとき、the Webhook Service shall 登録済み Webhook の一覧（ラベルと登録日時）と新規登録フォームを含むフルページを返す
2. When 利用者が有効なラベルと URL を `POST /webhooks` に送信したとき、the Webhook Service shall 新しい Webhook レコードを永続化し、更新後の一覧フラグメントを返す
3. If ラベルが空文字または空白のみであるとき、then the Webhook Service shall HX-Retarget でフォームに差し戻し、入力値を保持したままバリデーションエラーを表示する
4. If URL が `https://hooks.slack.com/` で始まらないとき、then the Webhook Service shall HX-Retarget でフォームに差し戻し、「Slack Incoming Webhook の URL を入力してください」というエラーを表示する
5. The Webhook Service shall 登録済み URL を画面表示する際にマスク（末尾の数文字以外を `*` で置換）して表示する
6. The Webhook Service shall 同一 URL の重複登録を許容する（ラベル違いで登録できる）

##### イベントページからの催促送信

7. While イベント閲覧ページに登録済み Webhook が 1 件以上存在するとき、the Event Service shall 「Slack で催促」セクションに登録済み Webhook の選択 UI と送信ボタンを表示する
8. While 登録済み Webhook が 0 件のとき、the Event Service shall 「Slack で催促」セクションに `/webhooks` への誘導リンクのみを表示する
9. When 主催者が Webhook を選んで `POST /events/:id/notify` を送信したとき、the Notification Service shall ランダムに選んだ小粋な文章テンプレートにイベントタイトルと URL を埋め込んだメッセージを当該 Webhook URL に POST する
10. When Slack への送信が成功したとき、the Notification Service shall 「催促を送信しました」というフラグメントを返す
11. If Slack Webhook への POST が 2xx 以外を返したとき、then the Notification Service shall 「Slack への送信に失敗しました」というエラーフラグメントを返し、ステータスコードをサーバーログに記録する
12. If 指定された Webhook ID が存在しないとき、then the Notification Service shall 404 ステータスを返す

##### メッセージ生成（Gemini API による動的生成）

13. The Notification Service shall **Gemini API の無料枠で利用可能な軽量モデル（既定: `gemini-flash-lite` 相当）** を呼び出して、催促メッセージ本文を都度生成する
14. The Notification Service shall Gemini への入力プロンプトに **イベントタイトル** と **完全なイベント URL** を含め、「思わずクリックしたくなる小粋で短い催促文を 1 つだけ生成する」旨をシステム指示として与える
15. The Notification Service shall Gemini への入力プロンプトで **イベントタイトルをユーザー入力として明示的に区別**し、プロンプトインジェクションを抑止する（タイトル文字列を引用区切り等で囲む）
16. The Notification Service shall API キーを環境変数 `GEMINI_API_KEY` から取得し、ソースコード / リポジトリにハードコードしない
17. The Notification Service shall ホスト名を環境変数 `APP_BASE_URL`（または同等のもの）から組み立て、ローカル / 本番の差を吸収する
18. The Notification Service shall Gemini レスポンスから抽出した文章末尾にイベント URL を必ず含める（モデルが URL を出力しなかった場合でも URL を後付け連結する）
19. The Notification Service shall 生成されたメッセージ本文を最大 280 文字に切り詰める（極端に長い出力で Slack 投稿が崩れないようにする）
20. The Notification Service shall Slack 送信ペイロードを `{ "text": "<最終本文>" }` の最小形式で構成する
21. The Notification Service shall **3 段階のフォールバック戦略** で本文生成を行う：
    - **Tier 1（通常）**: Gemini API で動的生成
    - **Tier 2（一時的失敗時）**: 実装内フォールバックテンプレートからランダム選択した小粋な文章
    - **Tier 3（最終防衛）**: 文章生成を一切行わず、`{title}` と `{url}` のみで構成された最低限のプレーンメッセージ（例: `"{title}\n{url}"`）
22. If `GEMINI_API_KEY` が未設定であるとき、then the Notification Service shall Gemini を呼ばずに **Tier 2（テンプレート）** を使用する
23. If Gemini API がネットワークエラー・タイムアウト・5xx・想定外の形式・パースエラーを返したとき（一時的失敗）、then the Notification Service shall **Tier 2（テンプレート）** を使用し、エラー内容をサーバーログに記録する
24. If Gemini API が **HTTP 429（レート制限超過）または 403 / クォータ枯渇相当のエラー** を返したとき（無料枠枯渇）、then the Notification Service shall **Tier 3（最終防衛: タイトル + URL のみ）** を使用し、Slack へは確実に送信する
25. While 当該プロセス内で Tier 3 を一度発動したとき、the Notification Service shall 同一プロセスの起動中はそれ以降の催促送信で Gemini API を呼び出さず、Tier 3 直行（または設定により Tier 2 直行）として無料枠への追加リクエストを抑止する
26. The Notification Service shall フォールバックテンプレート（Tier 2）を **3 件以上** 実装内に保持し、Tier 2 発動時はランダム選択する
27. The Notification Service shall Gemini 呼び出しのタイムアウトを 5 秒以内に設定する（Slack 送信ハンドラ全体が長時間ブロックしないようにする）
28. While Gemini からの生成メッセージを Slack に送信する処理が走っているとき、the Event Service shall htmx の `hx-indicator` で送信中の視覚フィードバックを表示する
29. When Tier 2 / Tier 3 が発動して送信が完了したとき、the Notification Service shall サーバーログに発動 Tier を記録する（運用時に無料枠の枯渇兆候を観測可能にするため）

### Requirement 9: アクセシビリティと UI 標準

**Objective:** As a 利用者, I want pico.css のセマンティック HTML に沿った読みやすい UI で操作できる, so that スマートフォン・タブレット・デスクトップで問題なく利用できる

#### Acceptance Criteria

1. The Event Service shall 各フォーム要素を `<label>` で関連付ける
2. The Event Service shall 主要な viewport（375 / 768 / 1280）でレイアウト崩れを起こさない
3. The Event Service shall ボタン・リンクのタップ領域を概ね 44px 四方以上で表現する
4. The Event Service shall pico.css のデフォルト配色を使用し、独自の色指定を行わない
5. The Event Service shall 集計表のテキストコントラストを WCAG AA 相当（4.5:1）以上で表示する

### Requirement 10: クライアント側状態管理（Alpine.js）

**Objective:** As a 開発者, I want タブ・モーダル等のクライアント側状態を持つ UI を Alpine.js で宣言的に実装できる, so that htmx の部分更新では扱いにくいリッチな UI 状態を、軽量かつ HTML 属性ベースで管理し、独自スクリプトの増殖を防げる

#### Acceptance Criteria

1. When tyousei-san のビューにタブ / モーダル / ドロップダウン / アコーディオン等の **クライアント側状態を持つ UI** を新規追加するとき、the Event Service shall Alpine.js のディレクティブ（`x-data` / `x-show` / `x-on` / `x-bind` 等）でその状態管理を実装する
2. The Event Service shall Alpine.js を `package.json` の依存に明示的に追加し、`node_modules` から `serveStatic` 経由で配信する（CDN 直リンク・独自バンドル・実行時取得は禁止）
3. The Event Service shall Alpine.js のスクリプトを `<Layout>` 等の共通レイアウト内で読み込み、`htmx` との初期化順序を確定させる（推奨: Alpine を `defer` で読み込み、htmx の swap 完了後に Alpine が初期化できる構成にする）
4. The Event Service shall htmx の部分更新で挿入された DOM に対しても Alpine.js が初期化されるよう、`htmx:afterSwap` 等で再初期化が走る構成を維持する
5. While 単純な表示 / 非表示の制御で済む場合、the Event Service shall pico.css の `<details>` / `<summary>` 等のセマンティック HTML を優先し、Alpine.js は **純粋な HTML / CSS では表現できない状態管理にのみ** 使用する
6. The Event Service shall Alpine.js のロジックは HTML 属性（`x-*`）として宣言的に書き、`<script>` 内に手書きの DOM 操作コード（`document.querySelector` 等）を増やさない
7. The Event Service shall モーダル UI を実装するとき、`role="dialog"` / `aria-modal="true"` / フォーカストラップ相当の挙動を Alpine.js で確保し、アクセシビリティを損なわない
8. The Event Service shall Alpine.js が利用不能（JS 無効・読み込み失敗）な環境でも、フォーム送信・回答登録・閲覧などの **コア機能は htmx の部分更新と通常のフォーム POST で動作する** ことを維持する（プログレッシブエンハンスメント）
