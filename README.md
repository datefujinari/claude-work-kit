# 会社用キット：タスクボード × AI ＋ 説明動画づくり

自宅で作った2つの仕組みを、会社の PC で同じように使うためのキットと手順書です。

| 仕組み | 内容 | このキットのどこ |
|---|---|---|
| タスクボード × AI | Obsidian の保管庫。Inbox に書く → Claude が振り分け → タスクボードで一覧 | `vault-template/` |
| 説明動画づくり | 技術の仕組みを、カード図解の縦型アニメ動画（MP4）にする Claude スキル | `skills/` と `samples/` |

> [!IMPORTANT]
> - このキットには個人のノートや業務情報は入っていません（仕組みのファイルだけ）。
> - **会社で作ったノートや動画は、このリポジトリに push しないこと。** 会社の PC の中（または会社が認めた保存先）に置く。
> - 会社の PC に Obsidian を入れてよいか、業務情報を Claude に渡してよいかは、社内ルールを先に確認する。

---

## 0. 事前に確認すること（5分）

| 確認すること | どこで | OK の状態 |
|---|---|---|
| 自分に Claude Team のライセンスが付いている | claude.ai に会社アカウントでログイン | 組織名が表示され、チャットできる |
| スキルが使える設定になっている | 組織のオーナーに確認：**組織の設定 → Plugins & skills → Policy タブ** | 「Cloud code execution and file creation」と「Skills」がオン |
| 自分でスキルを追加できる | 同上 | 「User-created skills」がオン（オフならオーナーに登録を頼む → 4-A の「オーナーに頼む場合」） |
| Obsidian をインストールしてよい | 社内のソフトウェア申請ルール | インストール可 |

> Cowork は Team プランでは標準でオンです（オーナーがオフにしていなければ使えます）。Claude Code も Team の全シートに含まれています。

---

## 1. キットを会社の PC に持ってくる

どちらか一方で OK。

- **ZIP（かんたん）**: GitHub のこのリポジトリのページ → 緑の「Code」→「Download ZIP」→ 展開
- **git**: `git clone https://github.com/datefujinari/claude-work-kit.git`

展開したフォルダを、以下「キット」と呼びます。

---

## 2. タスクボードを作る（10分）

1. Obsidian をインストールする（https://obsidian.md/ 。**バージョン 1.9 以上**。タスクボードに使う「Bases」機能のため）
2. キットの `vault-template` フォルダを、仕事用の場所にコピーし、名前を変える
   - 例: `C:\Users\<自分>\work_obsidian`
   - **OneDrive の同期フォルダは避ける**（同期の競合が起きやすい。会社のルールで指定があればそれに従う）
   - エクスプローラーで隠しフォルダ `.obsidian` も一緒にコピーされていることを確認（表示 → 隠しファイル）
3. Obsidian を起動 →「フォルダを保管庫として開く」→ 2 のフォルダを選ぶ
4. 設定 → コアプラグイン で次がオンになっているか確認：**Bases / デイリーノート / テンプレート / プロパティ**
5. `Home.md` を開き、タスクボードに「サンプル - タスクボードの表示を確認する」が出れば成功
   - 確認したら、そのノートの `status` を `done` に変える

> エリア（`20_Areas/` の Work / Learning / Dev）は仮です。会社の担当領域に合わせて Claude に「エリアを〇〇と△△に変えて」と頼めば、フォルダ・Home・タグをまとめて直します。

---

## 3. Claude とつなぐ（どちらか、または両方）

保管庫の中の `CLAUDE.md` に AI 向けの運用ルールが書いてあり、Claude はそれに従って動きます。

### 3-A. Claude アプリ（Cowork）で使う ― おすすめ

1. https://claude.com/download から Claude デスクトップアプリを入れ、**会社アカウント**でログイン
2. Cowork で新しいタスクを開き、「フォルダを追加」で 2 の保管庫フォルダを接続
3. 最初に一度だけこう頼む：
   > この保管庫の CLAUDE.md を読んで、ルールを把握して。今日のデイリーノートを作って、AIログに「会社環境のセットアップ完了」と記録して。

### 3-B. Claude Code で使う

1. Claude Code をインストール（公式手順: https://code.claude.com/docs/ ）
2. PowerShell で保管庫フォルダに移動して起動：
   ```powershell
   cd $HOME\work_obsidian
   claude
   ```
3. ログイン方法は「Claude account with subscription」→ ブラウザで **会社の Team 組織**を選んで許可
4. 保管庫フォルダで起動すれば `CLAUDE.md` は自動で読まれる

### 毎日の使い方（どちらでも同じ）

| やりたいこと | Claude への頼み方 |
|---|---|
| メモを整理 | （`00_Inbox/Inbox.md` に1行ずつ書いてから）「Inbox整理して」 |
| 今日やることを決める | 「今日やるを提案して」（3つまで） |
| 進捗を記録 | 「〇〇終わった」「〇〇は△△さんの返事待ち」 |
| 週の振り返り | 「週次レビューして」 |

---

## 4. 説明動画づくりのスキルを入れる

スキル本体は `skills/card-motion-explainer/SKILL.md`。HyperFrames（HTML→MP4、Apache-2.0）と GSAP（無料）を使って、1080×1920・45〜60秒の縦型動画を作ります。見本は `samples/passkey_cards_prototype.mp4`（パスキーの説明、約40秒）。

### 4-A. Claude アプリ（Cowork / claude.ai）に入れる ― おすすめ

動画の書き出しは Claude のクラウド環境で行われるので、**会社の PC に Node.js などを入れる必要はありません。**

1. claude.ai またはデスクトップアプリで **カスタマイズ（Customize）→ スキル（Skills）**
2. 「＋」→「スキルを作成」→「**スキルをアップロード**」
3. キットの `skills/card-motion-explainer.zip` を選ぶ
4. 一覧に `card-motion-explainer` が出て、オンになっていれば完了

**オーナーに頼む場合**（自分でアップロードできない／試用メンバー全員に配りたい）:
組織のオーナーが **組織の設定 → Plugins & skills →「追加」→「スキルをアップロード」** で同じ ZIP を登録すると、組織の全員が使えます。

### 4-B. Claude Code に入れる

1. スキルを置く：
   ```powershell
   mkdir $HOME\.claude\skills\card-motion-explainer -Force
   copy <キット>\skills\card-motion-explainer\SKILL.md $HOME\.claude\skills\card-motion-explainer\
   ```
2. 動画の書き出しに必要なもの（会社の PC にインストールが必要）：
   - Node.js（LTS 版）… `winget install OpenJS.NodeJS.LTS`
   - ffmpeg（書き出した動画のコマ確認用）… `winget install Gyan.FFmpeg`
   - Google Chrome（HyperFrames が描画に使う）
   - npm からのダウンロード（`npx hyperframes`、`npm i gsap`）が社内プロキシで止められていないこと
3. Claude Code を起動し直すと、スキルが使えるようになる

### 動画の頼み方（例）

> card-motion-explainer で「多要素認証（MFA）の仕組み」を説明する動画を作って。対象は一般社員、字幕のみ、50秒くらい。

- 最初に場面表（台本）が出てくるので、内容を確認してから書き出してもらう
- 実在の社名・個人名・社内システム名は入れない（スキルのルールでもそうなっている）

---

## 5. 困ったとき

| 症状 | 対処 |
|---|---|
| タスクボードが表示されない／「Bases」がない | Obsidian を 1.9 以上に更新 → 設定 → コアプラグインで Bases をオン |
| タスクボードは出るがタスクが出ない | タスクノートの先頭に `type: task` があるか確認（`05_Tasks/` のテンプレートから作る） |
| テンプレートやデイリーノートの場所がおかしい | `.obsidian` フォルダがコピーされていない。キットの `vault-template/.obsidian` をコピーし直す |
| スキルのアップロード欄がない | 組織で「User-created skills」がオフ → オーナーに 4-A の方法で登録を頼む |
| スキルを使うとコード実行できないと言われる | 組織で「Cloud code execution and file creation」がオフ → オーナーにオンを依頼 |
| 動画の書き出しで npm / Chrome のダウンロードに失敗（アプリ） | 組織のネットワーク（egress）設定で npm レジストリが許可されていない可能性 → オーナーに確認 |
| 動画の書き出しで失敗（Claude Code） | 社内プロキシで npm が止められている可能性 → 情シスに確認、または 4-A（アプリ）で作る |
| Claude Code のログインで個人アカウントになる | `/logout` → `claude` で起動し直し、会社の Team 組織を選ぶ |

---

## 6. このキットの中身

```
claude-work-kit/
├── README.md                         ← この手順書
├── vault-template/                   ← 空の保管庫（そのまま Obsidian で開ける）
│   ├── CLAUDE.md                     ← AI 向けの運用ルール
│   ├── Home.md                       ← 入口（タスクボードを埋め込み）
│   ├── タスクボード.base             ← タスクボード（7つのビュー）
│   ├── 00_Inbox/ 01_Daily/ 05_Tasks/ 10_Projects/ 20_Areas/ 30_Knowledge/ 40_Resources/ 90_Archive/
│   ├── 99_System/                    ← テンプレート・タグ一覧・タスク管理ガイド
│   └── .obsidian/                    ← デイリーノート・テンプレート等の設定（隠しフォルダ）
├── skills/
│   ├── card-motion-explainer/SKILL.md
│   └── card-motion-explainer.zip     ← アプリにアップロードする用
└── samples/
    └── passkey_cards_prototype.mp4   ← 見本動画
```

### 更新するとき（自宅側）
自宅の保管庫で CLAUDE.md・タスクボード・テンプレートやスキルを改良したら、自宅の Claude に「会社用キットを更新して」と頼む。会社では ZIP を取り直すか `git pull` し、変わったファイルだけ保管庫に上書きする（自分のノートは上書きしない）。

## 参考（公式ドキュメント）
- [Use Claude Cowork on Team and Enterprise plans](https://support.claude.com/en/articles/13455879-use-claude-cowork-on-team-and-enterprise-plans)
- [Use skills in Claude](https://support.claude.com/en/articles/12512180-use-skills-in-claude)
- [Provision and manage skills for your organization](https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization)
- [Use Claude Code with your Team or Enterprise plan](https://support.claude.com/en/articles/11845131-use-claude-code-with-your-team-or-enterprise-plan)
