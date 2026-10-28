// 内蔵デッキ「IT・エンジニア」。1 行 1 語で「単語|品詞|意味」、品詞は n / v / adj / adv / phr（熟語）。無ければ空でよい
// 4 列目以降は「例文|例文の和訳|例文中で強調する語形」。答えたあとに例文として出す（設定の「例文」）
(window.WORD_SPRINT_DECKS = window.WORD_SPRINT_DECKS || []).push({
  id: 'it', group: '分野別', name: 'IT・エンジニア', desc: '開発・運用の現場で使う語',
  raw: `
dependency|n|依存関係|Update the dependency to fix the security issue.|セキュリティの問題を直すため、その依存関係を更新してください。|dependency
deployment|n|デプロイ、展開|The deployment is scheduled for Friday night.|デプロイは金曜の夜に予定されている。|deployment
latency|n|遅延、レイテンシ|We reduced the API latency by caching responses.|応答をキャッシュしてAPIの遅延を減らした。|latency
throughput|n|スループット、処理量|The new server doubled our throughput.|新しいサーバーで処理量が倍になった。|throughput
bottleneck|n|ボトルネック、隘路|The database is the main bottleneck.|データベースが主なボトルネックだ。|bottleneck
redundancy|n|冗長性|We added redundancy to avoid a single point of failure.|単一障害点を避けるために冗長性を持たせた。|redundancy
availability|n|可用性|The service guarantees 99.9% availability.|そのサービスは99.9%の可用性を保証している。|availability
scalability|n|拡張性|Scalability was a key factor in choosing the cloud provider.|拡張性がクラウド事業者を選ぶ決め手になった。|Scalability
vulnerability|n|脆弱性|A critical vulnerability was found in the library.|そのライブラリに重大な脆弱性が見つかった。|vulnerability
authentication|n|認証|The app supports two-factor authentication.|そのアプリは二要素認証に対応している。|authentication
authorization|n|認可|You need authorization to access this resource.|このリソースにアクセスするには認可が必要だ。|authorization
encryption|n|暗号化|All data is protected by encryption.|すべてのデータは暗号化で保護されている。|encryption
credential|n|認証情報|Never commit credentials to the repository.|認証情報を決してリポジトリにコミットしないこと。|credentials
outage|n|サービス停止|The outage lasted about two hours.|サービス停止は約2時間続いた。|outage
incident|n|インシデント、事象|We wrote a report on last night's incident.|昨夜のインシデントについて報告書を書いた。|incident
workaround|n|回避策|Restarting the service is a temporary workaround.|サービスの再起動は一時的な回避策だ。|workaround
root cause|n|根本原因|We are still looking for the root cause of the failure.|障害の根本原因をまだ調べている。|root cause
rollback|n|ロールバック、切り戻し|We performed a rollback to the previous version.|前のバージョンへのロールバックを行った。|rollback
migration|n|移行|The database migration took longer than expected.|データベースの移行は予想より時間がかかった。|migration
configuration|n|設定、構成|Check the configuration file for typos.|設定ファイルに誤字がないか確認してください。|configuration
specification|n|仕様|The feature does not meet the specification.|その機能は仕様を満たしていない。|specification
requirement|n|要件|Security is a key requirement for this system.|セキュリティはこのシステムの重要な要件だ。|requirement
deliverable|n|成果物|The final deliverable is due at the end of the month.|最終成果物の期限は月末だ。|deliverable
milestone|n|マイルストーン、節目|We reached an important milestone this week.|今週、重要なマイルストーンに到達した。|milestone
backlog|n|未処理の作業、バックログ|The team is working through a large backlog of bugs.|チームは大量にたまったバグを片付けている。|backlog
threshold|n|しきい値|An alert is sent when CPU usage exceeds the threshold.|CPU使用率がしきい値を超えると警告が送られる。|threshold
metric|n|指標|Response time is an important metric for users.|応答時間は利用者にとって重要な指標だ。|metric
granularity|n|粒度|You can adjust the granularity of the logs.|ログの粒度は調整できる。|granularity
deprecate|v|非推奨にする|This function will be deprecated in the next release.|この関数は次のリリースで非推奨になる。|deprecated
provision|v|（リソースを）用意する|The script provisions a new server in minutes.|そのスクリプトは数分で新しいサーバーを用意する。|provisions
propagate|v|伝播する|It may take a few hours for DNS changes to propagate.|DNSの変更が伝播するまで数時間かかることがある。|propagate
mitigate|v|緩和する|We applied a patch to mitigate the risk.|リスクを緩和するためにパッチを当てた。|mitigate
troubleshoot|v|問題の原因を調べて解決する|She spent the morning troubleshooting the network.|彼女は午前中ずっとネットワークの問題を調べて解決していた。|troubleshooting
reproduce|v|再現する|I can't reproduce the bug on my machine.|自分のマシンではそのバグを再現できない。|reproduce
isolate|v|切り分ける、隔離する|First, we need to isolate the problem.|まず問題を切り分ける必要がある。|isolate
escalate|v|上位に引き継ぐ、エスカレーションする|If you can't fix it, escalate the issue to the team lead.|直せなければ、その件をチームリーダーに上げてください。|escalate
refactor|v|リファクタリングする|We refactored the code to make it easier to read.|読みやすくするためにコードをリファクタリングした。|refactored
validate|v|妥当性を検証する|The form validates the email address before sending.|そのフォームは送信前にメールアドレスを検証する。|validates
terminate|v|終了させる、解除する|The process was terminated after the timeout.|そのプロセスはタイムアウト後に終了させられた。|terminated
initialize|v|初期化する|Initialize the variables before using them.|変数は使う前に初期化してください。|Initialize
invoke|v|呼び出す|This method is invoked when the button is clicked.|このメソッドはボタンが押されたときに呼び出される。|invoked
override|v|上書きする|The subclass overrides the default behavior.|そのサブクラスは既定の動作を上書きする。|overrides
retrieve|v|取得する|The app retrieves data from the server every minute.|アプリは毎分サーバーからデータを取得する。|retrieves
decommission|v|廃止する、退役させる|The old servers will be decommissioned next year.|古いサーバーは来年廃止される。|decommissioned
consolidate|v|統合する、集約する|We consolidated three databases into one.|3つのデータベースを1つに統合した。|consolidated
enforce|v|強制する、適用する|The tool enforces a consistent coding style.|そのツールは統一されたコーディング規約を強制する。|enforces
append|v|末尾に追加する|The new log entry is appended to the end of the file.|新しいログはファイルの末尾に追加される。|appended
idempotent|adj|冪等な|The API call is idempotent, so retrying is safe.|そのAPI呼び出しは冪等なので、再試行しても安全だ。|idempotent
asynchronous|adj|非同期の|The upload runs as an asynchronous task.|アップロードは非同期のタスクとして動く。|asynchronous
backward-compatible|adj|後方互換の|The new version is backward-compatible with the old API.|新しいバージョンは旧APIと後方互換がある。|backward-compatible
intermittent|adj|断続的な|Users reported intermittent connection errors.|利用者から断続的な接続エラーが報告された。|intermittent
redundant|adj|冗長な|Remove the redundant code.|冗長なコードを削除してください。|redundant
persistent|adj|永続的な|The data is saved to persistent storage.|データは永続的なストレージに保存される。|persistent
legacy|adj|旧式の、レガシーな|We still maintain a legacy system written in COBOL.|COBOLで書かれた旧式のシステムをまだ保守している。|legacy
concurrent|adj|同時実行の、並行の|The server can handle many concurrent requests.|そのサーバーは多くの同時リクエストを処理できる。|concurrent
respectively|adv|それぞれ|The tests took 3 and 5 minutes, respectively.|テストはそれぞれ3分と5分かかった。|respectively
inadvertently|adv|うっかり、不注意で|I inadvertently deleted the wrong file.|うっかり違うファイルを消してしまった。|inadvertently
ideally|adv|理想的には|Ideally, the tests should run in under a minute.|理想的には、テストは1分以内に終わるべきだ。|Ideally
explicitly|adv|明示的に|The type must be declared explicitly.|型は明示的に宣言しなければならない。|explicitly
tentatively|adv|暫定的に|The release is tentatively scheduled for May.|リリースは暫定的に5月に予定されている。|tentatively
retroactively|adv|さかのぼって|The new rule will be applied retroactively.|新しい規則はさかのぼって適用される。|retroactively
`});
