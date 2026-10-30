# word-sprint 開発ルール

グローバルの CLAUDE.md（ブランチフロー feature → develop → main、コミット粒度など）に加えて、このリポジトリでは次の運用にする。

## Issue 先行

- 依頼は、実装の前に GitHub Issue を 1 件立てる。タイトルは依頼の一言、本文は完了条件の箇条書き。小さな修正でも立てる。
- iPhone 実機でしか確かめられない項目は個別に立てず、#17 にチェック項目としてコメントする。
- 優先順位と依存関係は #20（ロードマップ）に書く。

## コミットとマージ

- feature ブランチのコミット末尾に `Refs #n` を書く。
- develop へのマージメッセージには `Closes #n` を書く（GitHub は main に入ったときだけ自動で閉じるので、develop では閉じない）。
- main への公開（ユーザーの明示的な許可が必要）の後、含まれる Issue に「公開済み（コミット番号）」とコメントして閉じる。

## PR は使わない

開発者は 1 人で、CI は main への push で回る。feature → develop → main のローカルマージ（`--no-ff`）で進める。共同開発になったら PR を使う。

## テスト

```
docker run --rm -v "$PWD":/work:ro -w /work -e NODE_PATH=/usr/src/app/node_modules zenika/alpine-chrome:with-puppeteer node tests/run.js [名前...]
```

コミット前に全件（引数なし）を通す。ファイルを書き出す場合は `-u 0` を付ける。
