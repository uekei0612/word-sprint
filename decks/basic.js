// 内蔵デッキ「中学基礎」。1 行 1 語で「単語|品詞|意味」、品詞は n / v / adj / adv / phr（熟語）。無ければ空でよい
// 4 列目以降は「例文|例文の和訳|例文中で強調する語形」。答えたあとに例文として出す（設定の「例文」）
(window.WORD_SPRINT_DECKS = window.WORD_SPRINT_DECKS || []).push({
  id: 'basic', group: 'レベル別', name: '中学基礎', desc: '英検3級の目安。日常の基本語',
  raw: `
family|n|家族|My family lives in a small town.|私の家族は小さな町に住んでいます。|family
friend|n|友達|She is my best friend.|彼女は私の一番の友達です。|friend
library|n|図書館|I often study at the library.|私はよく図書館で勉強します。|library
hospital|n|病院|My grandfather is in the hospital.|祖父は入院しています。|hospital
station|n|駅|Let's meet at the station at ten.|10時に駅で会いましょう。|station
morning|n|朝|I drink milk every morning.|私は毎朝牛乳を飲みます。|morning
evening|n|夕方|We watched a movie in the evening.|私たちは夕方に映画を見ました。|evening
weather|n|天気|The weather is nice today.|今日は天気がいいです。|weather
season|n|季節|Spring is my favorite season.|春は私の一番好きな季節です。|season
country|n|国|Japan is a country in Asia.|日本はアジアの国です。|country
language|n|言語|How many languages can you speak?|あなたは何か国語を話せますか。|languages
question|n|質問|May I ask you a question?|質問してもいいですか。|question
idea|n|考え、アイデア|That's a good idea.|それはいい考えですね。|idea
history|n|歴史|I'm interested in Japanese history.|私は日本の歴史に興味があります。|history
science|n|科学|I want to study science at university.|私は大学で科学を学びたいです。|science
picture|n|絵、写真|Can I take a picture here?|ここで写真を撮ってもいいですか。|picture
breakfast|n|朝食|What did you have for breakfast?|朝食に何を食べましたか。|breakfast
vacation|n|休暇|We went to Okinawa during summer vacation.|私たちは夏休みに沖縄へ行きました。|vacation
village|n|村|He grew up in a quiet village.|彼は静かな村で育ちました。|village
river|n|川|Children are swimming in the river.|子どもたちが川で泳いでいます。|river
mountain|n|山|We climbed the mountain last weekend.|私たちは先週末その山に登りました。|mountain
island|n|島|Hokkaido is a large island.|北海道は大きな島です。|island
vegetable|n|野菜|You should eat more vegetables.|もっと野菜を食べたほうがいいですよ。|vegetables
umbrella|n|傘|Don't forget your umbrella.|傘を忘れないでね。|umbrella
future|n|未来|I want to be a doctor in the future.|私は将来医者になりたいです。|future
begin|v|始める|The class begins at nine.|授業は9時に始まります。|begins
finish|v|終える|Did you finish your homework?|宿題は終わりましたか。|finish
arrive|v|到着する|The train arrived at the station on time.|電車は時間どおりに駅に到着しました。|arrived
leave|v|出発する、去る|The bus leaves at seven.|バスは7時に出発します。|leaves
remember|v|覚えている|Do you remember his name?|彼の名前を覚えていますか。|remember
forget|v|忘れる|I forgot my key at home.|家に鍵を忘れました。|forgot
borrow|v|借りる|Can I borrow your pen?|ペンを借りてもいいですか。|borrow
lend|v|貸す|Could you lend me some money?|お金を少し貸してもらえますか。|lend
carry|v|運ぶ|Let me carry your bag.|かばんを運びましょう。|carry
choose|v|選ぶ|Please choose one color.|色を1つ選んでください。|choose
decide|v|決める|We decided to go by bus.|私たちはバスで行くことに決めました。|decided
explain|v|説明する|Can you explain this word?|この単語を説明してくれますか。|explain
travel|v|旅行する|I want to travel around the world.|私は世界中を旅行したいです。|travel
practice|v|練習する|She practices the piano every day.|彼女は毎日ピアノを練習します。|practices
understand|v|理解する|I don't understand this question.|この質問がわかりません。|understand
believe|v|信じる|I can't believe it!|信じられない！|believe
agree|v|賛成する|I agree with you.|あなたに賛成です。|agree
worry|v|心配する|Don't worry about it.|それについては心配しないで。|worry
wait|v|待つ|Please wait here for a minute.|ここで少し待っていてください。|wait
build|v|建てる|They are building a new school.|新しい学校を建てているところです。|building
catch|v|捕まえる|The cat caught a mouse.|猫がネズミを捕まえました。|caught
teach|v|教える|Mr. Sato teaches English.|佐藤先生は英語を教えています。|teaches
sell|v|売る|That shop sells fresh bread.|あの店は焼きたてのパンを売っています。|sells
buy|v|買う|I bought a new bike yesterday.|昨日新しい自転車を買いました。|bought
win|v|勝つ|Our team won the game.|私たちのチームが試合に勝ちました。|won
lose|v|負ける、失う|We lost the game by one point.|私たちは1点差で試合に負けました。|lost
beautiful|adj|美しい|The view from the top is beautiful.|頂上からの景色は美しいです。|beautiful
difficult|adj|難しい|This test was difficult.|このテストは難しかったです。|difficult
easy|adj|簡単な|The question was easy.|その問題は簡単でした。|easy
important|adj|重要な|Sleep is important for your health.|睡眠は健康にとって重要です。|important
famous|adj|有名な|Kyoto is famous for its old temples.|京都は古いお寺で有名です。|famous
popular|adj|人気のある|This song is popular among students.|この歌は学生の間で人気があります。|popular
expensive|adj|高価な|This watch is too expensive.|この時計は高すぎます。|expensive
cheap|adj|安い|The vegetables are cheap at this store.|この店は野菜が安いです。|cheap
busy|adj|忙しい|I'm busy this week.|今週は忙しいです。|busy
hungry|adj|空腹の|I'm very hungry now.|今とてもお腹が空いています。|hungry
tired|adj|疲れた|You look tired.|疲れているようですね。|tired
angry|adj|怒った|Why is he so angry?|彼はなぜそんなに怒っているのですか。|angry
different|adj|異なる|My opinion is different from yours.|私の意見はあなたのとは異なります。|different
careful|adj|注意深い|Be careful when you cross the street.|道を渡るときは注意しなさい。|careful
dangerous|adj|危険な|It's dangerous to swim here.|ここで泳ぐのは危険です。|dangerous
quiet|adj|静かな|Please be quiet in the library.|図書館では静かにしてください。|quiet
strong|adj|強い|He is strong enough to lift the box.|彼はその箱を持ち上げられるほど力が強いです。|strong
kind|adj|親切な|It's very kind of you to help me.|手伝ってくれてどうもご親切に。|kind
young|adj|若い|My mother looks young for her age.|母は年の割に若く見えます。|young
always|adv|いつも|She always gets up early.|彼女はいつも早く起きます。|always
usually|adv|たいてい|I usually walk to school.|私はたいてい歩いて学校へ行きます。|usually
sometimes|adv|ときどき|I sometimes play tennis with my father.|私はときどき父とテニスをします。|sometimes
never|adv|決して〜ない|I will never forget this day.|私はこの日を決して忘れません。|never
often|adv|よく、しばしば|We often go to the park on Sundays.|私たちは日曜日によく公園へ行きます。|often
already|adv|すでに|I have already eaten lunch.|もう昼食を食べました。|already
again|adv|再び|Please say that again.|もう一度言ってください。|again
together|adv|一緒に|Let's go together.|一緒に行きましょう。|together
soon|adv|すぐに|The bus will come soon.|バスはすぐに来ます。|soon
slowly|adv|ゆっくりと|Could you speak more slowly?|もっとゆっくり話していただけますか。|slowly
`});
