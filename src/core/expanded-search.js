(function exposeExpandedSearch(root) {
  const seasonal = Object.freeze({
    spring: ["新生活 収納", "入園 入学 準備", "春 家事用品"],
    summer: ["ハンディファン", "冷感寝具", "日傘", "ネッククーラー", "冷感インナー"],
    autumn: ["防災リュック", "衣替え 収納", "秋 旅行用品"],
    winter: ["電気毛布", "湯たんぽ", "デスクヒーター", "あったか靴下", "断熱カーテン"],
    newlife: ["新生活 収納", "引っ越し 収納", "デスク 収納用品"],
    school: ["入園 入学 準備", "通園 通学用品", "名前付け 文具", "子ども 靴", "水筒"],
    travel: ["旅行用圧縮袋", "トラベルポーチ", "スーツケース", "ネックピロー", "旅行用充電器"],
    disaster: ["防災リュック", "非常食", "保存水", "携帯トイレ", "懐中電灯"],
    cleaning: ["窓掃除 ワイパー", "大掃除 洗剤", "収納ケース", "掃除機", "モップ"]
  });
  const seasonalPurposes = Object.freeze({
    spring: [{ value: "general", label: "全般" }, { value: "newlife", label: "新生活" }, { value: "school", label: "入園入学" }, { value: "pollen", label: "花粉・春の外出" }, { value: "fashion", label: "春のファッション" }, { value: "travel", label: "春の旅行" }],
    summer: [{ value: "general", label: "全般" }, { value: "heat", label: "暑さ対策" }, { value: "uv", label: "紫外線対策" }, { value: "rain", label: "梅雨・湿気対策" }, { value: "fashion", label: "夏のファッション" }, { value: "travel", label: "夏の旅行" }],
    autumn: [{ value: "general", label: "全般" }, { value: "disaster", label: "防災" }, { value: "clothing", label: "衣替え" }, { value: "cleaning", label: "秋の掃除" }, { value: "travel", label: "秋の旅行" }, { value: "winterPrep", label: "冬支度" }],
    winter: [{ value: "general", label: "全般" }, { value: "cold", label: "防寒対策" }, { value: "dry", label: "乾燥対策" }, { value: "heating", label: "暖房・省エネ" }, { value: "fashion", label: "冬のファッション" }, { value: "yearEnd", label: "年末年始" }, { value: "travel", label: "冬の旅行" }],
    newlife: [{ value: "general", label: "全般" }, { value: "moving", label: "引っ越し" }, { value: "storage", label: "収納・整理" }, { value: "furniture", label: "家具・家電" }, { value: "school", label: "通勤・通学" }],
    school: [{ value: "general", label: "全般" }, { value: "prep", label: "入園入学準備" }, { value: "commute", label: "通園・通学" }, { value: "stationery", label: "名前付け・文具" }, { value: "clothing", label: "衣類・靴" }, { value: "lunch", label: "お弁当・水筒" }],
    travel: [{ value: "general", label: "全般" }, { value: "packing", label: "収納・パッキング" }, { value: "safety", label: "防犯・防災" }, { value: "gadgets", label: "旅行用品・家電" }, { value: "weather", label: "暑さ・寒さ対策" }],
    disaster: [{ value: "general", label: "全般" }, { value: "stock", label: "非常食・水" }, { value: "blackout", label: "停電対策" }, { value: "evacuation", label: "避難用品" }, { value: "storage", label: "防災収納" }],
    cleaning: [{ value: "general", label: "全般" }, { value: "kitchen", label: "キッチン掃除" }, { value: "bath", label: "浴室掃除" }, { value: "windows", label: "窓・網戸掃除" }, { value: "storage", label: "片付け・収納" }]
  });
  const purposeKeywords = Object.freeze({
    spring: { newlife: ["新生活 収納", "引っ越し 収納", "デスク 収納用品", "生活家電 新生活", "収納ラック"], school: ["入園 入学 準備", "通園 通学バッグ", "名前付け 文具", "子ども 靴", "水筒"], pollen: ["花粉対策 マスク", "花粉 メガネ", "空気清浄機", "洗濯物 花粉カバー", "花粉 掃除用品"], fashion: ["春 アウター メンズ", "春 カーディガン", "春 スニーカー", "春 バッグ", "春 レインコート"], travel: ["旅行用圧縮袋", "トラベルポーチ", "スーツケース", "ネックピロー", "旅行用充電器"] },
    summer: { heat: ["ハンディファン", "冷感寝具", "日傘", "ネッククーラー", "冷感インナー"], uv: ["日傘", "UVカット帽子", "アームカバー", "サングラス", "日焼け止め"], rain: ["除湿機", "衣類乾燥機", "室内物干し", "除湿剤", "折りたたみ傘"], fashion: ["冷感インナー", "メンズ 半袖シャツ", "レディース ワンピース", "サンダル", "帽子"], travel: ["旅行用圧縮袋", "トラベルポーチ", "スーツケース", "ネックピロー", "旅行用充電器"] },
    autumn: { disaster: ["防災リュック", "非常食", "保存水", "携帯トイレ", "懐中電灯"], clothing: ["衣類収納ケース", "圧縮袋 衣替え", "ハンガーラック", "防虫剤 衣類", "衣類カバー"], cleaning: ["掃除機", "フローリングワイパー", "窓掃除 ワイパー", "収納ケース", "洗剤 大掃除"], travel: ["旅行用圧縮袋", "トラベルポーチ", "スーツケース", "ネックピロー", "旅行用充電器"], winterPrep: ["電気毛布", "湯たんぽ", "断熱カーテン", "加湿器", "防寒靴下"] },
    winter: { cold: ["電気毛布", "湯たんぽ", "防寒手袋", "断熱カーテン", "あったか靴下"], dry: ["加湿器", "卓上加湿器", "保湿クリーム", "リップクリーム", "加湿フィルター"], heating: ["デスクヒーター", "セラミックファンヒーター", "電気毛布", "断熱カーテン", "湯たんぽ"], fashion: ["防寒コート メンズ", "防寒手袋", "あったか靴下", "ニット帽", "防寒ブーツ"], yearEnd: ["おせち 取り寄せ", "年末年始 食器", "大掃除 洗剤", "お年賀 ギフト", "収納ケース"], travel: ["旅行用圧縮袋", "防寒インナー 旅行", "スーツケース", "ネックピロー", "旅行用充電器"] },
    newlife: { moving: ["引っ越し 収納", "段ボールストッカー", "家具 保護シート", "収納ケース", "照明器具"], storage: ["収納ラック", "衣類収納ケース", "デスク 収納用品", "キッチン収納", "突っ張りラック"], furniture: ["デスク", "オフィスチェア", "収納ラック", "照明器具", "電気ケトル"], school: ["通勤バッグ", "通学バッグ", "弁当箱", "水筒", "折りたたみ傘"] },
    school: { prep: ["入園 入学 準備", "名前付け 文具", "上履き", "通園バッグ", "水筒"], commute: ["通園バッグ", "通学リュック", "レインコート 子ども", "防犯ブザー", "水筒"], stationery: ["名前シール", "お名前スタンプ", "文具セット", "学習机 収納", "筆箱"], clothing: ["子ども 上履き", "通学靴", "レインコート 子ども", "通園服", "靴下 子ども"], lunch: ["子ども 水筒", "弁当箱 子ども", "ランチバッグ", "箸セット", "保冷バッグ"] },
    travel: { packing: ["旅行用圧縮袋", "トラベルポーチ", "スーツケース", "パッキングオーガナイザー", "洗面ポーチ"], safety: ["防犯ブザー 旅行", "携帯用防災セット", "旅行用セキュリティポーチ", "携帯トイレ", "LEDライト"], gadgets: ["旅行用充電器", "モバイルバッテリー", "変換プラグ", "ネックピロー", "トラベルポーチ"], weather: ["日傘", "レインコート", "防寒インナー 旅行", "ハンディファン", "折りたたみ傘"] },
    disaster: { stock: ["非常食", "保存水", "長期保存食品", "非常用トイレ", "給水バッグ"], blackout: ["懐中電灯", "ランタン 防災", "モバイルバッテリー", "ポータブル電源", "乾電池"], evacuation: ["防災リュック", "携帯トイレ", "防災ラジオ", "ヘルメット 防災", "避難用ライト"], storage: ["防災リュック", "非常食 保存ケース", "防災用品 収納", "給水バッグ", "防災セット"] },
    cleaning: { kitchen: ["キッチン 掃除ブラシ", "換気扇 洗剤", "レンジ 掃除シート", "排水口 掃除", "キッチン収納"], bath: ["浴室 掃除ブラシ", "水垢 洗剤", "カビ取り剤", "浴室 排水口 掃除", "風呂ふた 掃除"], windows: ["窓掃除 ワイパー", "網戸 掃除ブラシ", "ガラス 洗剤", "窓用クリーナー", "結露対策シート"], storage: ["収納ケース", "衣類収納", "書類整理ボックス", "キッチン収納", "掃除道具 収納"] }
  });
  const modes = ["problem", "related", "seasonal"];
  const invalid = /[<>\x00-\x1f\x7f]/;
  const clean = (value, max = 80) => String(value || "").trim().slice(0, max);

  function validateKeywords(values) {
    if (!Array.isArray(values) || values.length < 1 || values.length > 5) throw new Error("検索語は1〜5件にしてください。");
    const terms = values.map((value) => {
      if (typeof value !== "string") throw new Error("検索語は文字列で入力してください。");
      const term = value.trim();
      if (term.length < 2 || term.length > 40 || invalid.test(term) || /^(?:https?:\/\/|javascript:)/i.test(term)) throw new Error("検索語は2〜40文字の文字列で入力してください。URLや制御文字は使えません。");
      return term;
    });
    if (new Set(terms).size !== terms.length) throw new Error("同じ検索語が重複しています。");
    return terms;
  }

  function parseCodexResult(raw, expected) {
    if (typeof raw !== "string" || raw.length > 8192) throw new Error("JSONは8KiB以内にしてください。");
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error("JSONの形式が正しくありません。"); }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object" || parsed.schemaVersion !== 1 || parsed.requestId !== expected.requestId || parsed.searchMode !== expected.searchMode || !modes.includes(parsed.searchMode)) throw new Error("schemaVersion・requestId・searchModeが一致しません。");
    return validateKeywords(parsed.keywords);
  }

  function suggestProblem(problem, targetUser) {
    const p = clean(problem, 40);
    const target = clean(targetUser, 25);
    if (p.length < 2) throw new Error("悩みを2文字以上入力してください。");
    let terms = null;
    if (/(足元|足先).*(寒|冷え)|(?:寒|冷え).*(足元|足先)/.test(p)) {
      terms = ["デスクヒーター", "足元パネルヒーター", "電気フットウォーマー", "ルームシューズ 防寒", "足元用ブランケット"];
    } else if (/(寒|冷え|防寒)/.test(p)) {
      if (/(在宅|ワーカー|デスク|仕事)/.test(target)) terms = ["デスクヒーター", "足元パネルヒーター", "電気フットウォーマー", "ルームシューズ 防寒", "足元用ブランケット"];
      else if (/(子ども|子供|キッズ)/.test(target)) terms = ["子ども 防寒手袋", "キッズ 防寒靴下", "子ども ブランケット", "湯たんぽ", "断熱カーテン"];
      else terms = ["電気毛布", "湯たんぽ", "デスクヒーター", "あったか靴下", "断熱カーテン"];
    } else if (/(乾燥|肌荒れ|唇.*荒)/.test(p)) {
      terms = ["加湿器", "卓上加湿器", "保湿クリーム", "リップクリーム", "加湿フィルター"];
    } else if (/(デスク|机)/.test(p) && /(狭|収納|片付|スペース)/.test(p)) {
      terms = ["デスク収納ラック", "モニター台 収納", "デスク下 収納", "デスク上 収納"];
      if (/(在宅|ワーカー|仕事)/.test(target)) terms.push("在宅ワーク デスク収納");
    } else if (/(暑|熱中症|蒸し暑)/.test(p)) {
      terms = ["ハンディファン", "冷感寝具", "日傘", "ネッククーラー", "冷感インナー"];
    } else if (/(収納|片付|物が多|スペース不足)/.test(p)) {
      terms = ["収納ケース", "突っ張りラック", "省スペース収納", "引き出し収納", "折りたたみ収納"];
    } else if (/(掃除|洗濯|家事).*(大変|面倒|負担|困)/.test(p)) {
      terms = ["コードレス掃除機", "フローリングワイパー", "室内物干し", "洗濯収納", "時短調理家電"];
    }
    if (terms) return validateKeywords(applyTarget(terms, target));
    throw new Error("この悩みはアプリ内ルールで具体的な商品カテゴリに展開できません。検索語を作らず、Codex用プロンプトを作成して提案を依頼してください。");
  }

  function applyTarget(terms, targetUser) {
    const target = clean(targetUser, 25);
    if (!target) return terms;
    return terms.map((term) => {
      if (term.includes(target) || (/(在宅|ワーカー|仕事)/.test(target) && /在宅|デスク|モニター台|机/.test(term)) || target.length + term.length + 1 > 40) return term;
      return `${target} ${term}`;
    });
  }

  function seasonalPurposeOptions(key) {
    if (!Object.hasOwn(seasonalPurposes, key)) throw new Error("季節・イベントを選んでください。");
    return seasonalPurposes[key].map((option) => ({ ...option }));
  }

  function hasSeasonConflict(key, intent) {
    const text = clean(intent, 80);
    const conflicts = {
      spring: /(?:真夏|夏の暑さ|暑さ対策|真冬|冬の寒さ|防寒対策)/,
      summer: /(?:冬の寒さ|寒さ対策|防寒対策|真冬|春の花粉)/,
      autumn: /(?:真夏|夏の暑さ|暑さ対策|真冬|冬の寒さ)/,
      winter: /(?:真夏|夏の暑さ|暑さ対策|冷感寝具|熱中症対策|春の花粉)/
    };
    return Boolean(conflicts[key]?.test(text));
  }

  function suggestIntent(intent, targetUser = "") {
    const text = clean(intent, 80);
    const target = clean(targetUser, 25);
    if (text.length < 2) throw new Error("自由入力を2文字以上入力してください。");
    if (/(デスク|机)/.test(text) && /(狭|収納|片付|スペース)/.test(text)) {
      return validateKeywords(applyTarget(["デスク収納ラック", "モニター台 収納", "デスク下 収納", "デスク上 収納"], target));
    }
    if (/(足元|足先).*(寒|冷え)|(?:寒|冷え).*(足元|足先)/.test(text)) return validateKeywords(["デスクヒーター", "足元パネルヒーター", "電気フットウォーマー", "ルームシューズ 防寒", "足元用ブランケット"]);
    if (/(寒|冷え|防寒)/.test(text)) return validateKeywords(applyTarget(["電気毛布", "湯たんぽ", "防寒手袋", "断熱カーテン", "あったか靴下"], target));
    if (/(乾燥|肌荒れ|唇.*荒)/.test(text)) return validateKeywords(applyTarget(["加湿器", "卓上加湿器", "保湿クリーム", "リップクリーム", "加湿フィルター"], target));
    if (/(暑|熱中症|蒸し暑)/.test(text)) return validateKeywords(applyTarget(["ハンディファン", "冷感寝具", "日傘", "ネッククーラー", "冷感インナー"], target));
    if (/(旅行|出張).*(荷物|収納|整理|準備)|(?:荷物|パッキング).*(旅行|出張)/.test(text)) return validateKeywords(applyTarget(["旅行用圧縮袋", "トラベルポーチ", "スーツケース", "ネックピロー", "旅行用充電器"], target));
    throw new Error("自由入力から商品カテゴリを特定できません。検索語は作成せず、Codex用プロンプトで提案を依頼してください。");
  }

  const explicitCategories = [
    { key: "underwear", group: "underwear", label: "下着", pattern: /ボクサー(?:ーパンツ|パンツ)?|トランクス|ブリーフ|パンティー?|ショーツ|アンダーウェア|下着/ },
    { key: "golf-head-cover", group: "golf", label: "ゴルフ用ヘッドカバー", pattern: /ヘッドカバー|クラブカバー|アイアンカバー|パターカバー/ },
    { key: "tapered-pants", group: "bottoms", label: "テーパードパンツ", pattern: /テーパード(?:パンツ)?/ },
    { key: "wide-pants", group: "bottoms", label: "ワイドパンツ", pattern: /ワイド(?:パンツ)?/ },
    { key: "slacks", group: "bottoms", label: "スラックス", pattern: /スラックス/ },
    { key: "chino-pants", group: "bottoms", label: "チノパン", pattern: /チノパンツ?|チノ/ },
    { key: "jogger-pants", group: "bottoms", label: "ジョガーパンツ", pattern: /ジョガーパンツ|ジョガー/ },
    { key: "denim-pants", group: "bottoms", label: "デニム・ジーンズ", pattern: /ジーンズ|デニム(?:パンツ)?/ },
    { key: "knit-pants", group: "bottoms", label: "ニットパンツ", pattern: /ニットパンツ/ },
    { key: "sweat-pants", group: "bottoms", label: "スウェットパンツ", pattern: /スウェットパンツ|スエットパンツ/ },
    { key: "short-pants", group: "bottoms", label: "ショート・ハーフパンツ", pattern: /ショートパンツ|ハーフパンツ/ },
    { key: "long-pants", group: "bottoms", label: "ロングパンツ", pattern: /ロングパンツ|カジュアルパンツ|ズボン/ },
    { key: "jacket", group: "outerwear", label: "ジャケット", pattern: /ジャケット|スイングトップ/ },
    { key: "blouson", group: "outerwear", label: "ブルゾン", pattern: /ブルゾン/ },
    { key: "coat", group: "outerwear", label: "コート", pattern: /コート/ },
    { key: "outerwear", group: "outerwear", label: "アウター", pattern: /アウター/ },
    { key: "shoes", group: "shoes", label: "靴", pattern: /スニーカー|ランニングシューズ|シューズ|ブーツ|パンプス|サンダル/ },
    { key: "shirts", group: "tops", label: "シャツ・トップス", pattern: /ポロシャツ|ワイシャツ|ブラウス|シャツ|カットソー|Tシャツ/ },
    { key: "bags", group: "bags", label: "バッグ", pattern: /ショルダーバッグ|トートバッグ|リュック|バックパック|バッグ|かばん/ }
  ];
  const promoNoise = /(?:\b\d{1,3}\s*[%％]\s*off\b|\b\d{1,3}\s*[%％]|\bSALE\b|OFF|クーポン|比較|おすすめ|人気|公式|送料無料)/gi;

  function categoryIn(source, { genre = false } = {}) {
    const text = clean(source, 240);
    if (!text) return null;
    const matches = explicitCategories.filter((entry) => entry.pattern.test(text));
    const groups = new Set(matches.map((entry) => entry.group));
    if (groups.size > 1) return { ambiguous: true, key: null, group: null, label: "カテゴリ要確認", evidence: text };
    if (matches.length) {
      const match = matches[0];
      return { key: match.key, group: match.group, label: match.label, evidence: text };
    }
    // 「パンツ」だけでは下着かボトムスか確定しない。
    // 楽天ジャンルの明示的なボトムス階層がある場合だけ大分類を補える。
    if (genre && /(?:^|[>／/\s　])(?:ボトムス|ズボン・パンツ)(?:$|[>／/\s　])/.test(text) && !/下着|インナー|ボクサー|トランクス|ブリーフ|パンティ/.test(text)) {
      return { key: "bottoms-unspecified", group: "bottoms", label: "ボトムス", evidence: text };
    }
    if (/パンツ|ズボン|ボトムス|ショーツ/.test(text)) return { ambiguous: true, key: null, group: null, label: "カテゴリ要確認", evidence: text };
    return null;
  }

  function identifyProductCategory(product) {
    const title = clean(product?.itemName || product?.title || product?.product?.itemName || product?.product?.title, 120);
    const genre = clean(product?.categoryName || product?.product?.categoryName || product?.genreName || product?.product?.genreName, 240);
    const caption = clean(product?.itemCaption || product?.product?.itemCaption, 500);
    const titleCategory = categoryIn(title);
    const genreCategory = categoryIn(genre, { genre: true });
    const captionCategory = categoryIn(caption);
    const evidenceCategories = [titleCategory, genreCategory, captionCategory].filter((category) => category && !category.ambiguous);
    const groups = new Set(evidenceCategories.map((category) => category.group));
    if (groups.size > 1) return { ambiguous: true, key: null, group: null, label: "カテゴリ要確認", evidence: [title, genre, caption].filter(Boolean).join(" / ") };
    if (titleCategory?.ambiguous || genreCategory?.ambiguous || captionCategory?.ambiguous) {
      // 強い分類語が別の項目にあれば、一般語の曖昧さを解消できる。
      const strong = evidenceCategories[0];
      if (!strong) return { ambiguous: true, key: null, group: null, label: "カテゴリ要確認", evidence: [title, genre].filter(Boolean).join(" / ") };
      return { ...strong, evidence: [title, genre, caption].filter(Boolean).join(" / ") };
    }
    return evidenceCategories[0] || null;
  }

  function extractGender(product, targetUser = "") {
    const text = [product?.itemName, product?.title, product?.categoryName, product?.product?.itemName, product?.product?.title, product?.product?.categoryName, targetUser].filter(Boolean).join(" ");
    if (/メンズ|男性用|紳士/.test(text)) return "メンズ";
    if (/レディース|女性用|婦人/.test(text)) return "レディース";
    return "";
  }

  function suggestRelated(product, relation, problem = "", targetUser = "") {
    const title = clean(product?.itemName || product?.title, 70);
    const category = clean(product?.categoryName || product?.product?.categoryName, 35);
    if (!title) throw new Error("起点商品の名前を確認できません。");
    const p = clean(problem, 35);
    let terms;
    if (relation === "compare") {
      const productCategory = identifyProductCategory(product);
      if (!productCategory || productCategory.ambiguous) throw new Error("比較元の商品カテゴリを特定できません。商品情報を確認し、検索語欄へカテゴリを含む語を入力してください。");
      const gender = extractGender(product, targetUser);
      if (productCategory.group === "bottoms") {
        const prefix = gender ? `${gender} ` : "";
        const titleText = [title, category].join(" ");
        terms = [];
        if (/テーパード/.test(titleText)) terms.push(`${prefix}テーパードパンツ`);
        if (/ニット/.test(titleText)) terms.push(`${prefix}ニットパンツ`);
        if (/ワイド/.test(titleText)) terms.push(`${prefix}ワイドパンツ`);
        terms.push(`${prefix}ロングパンツ`);
        const titleCategoryIndex = title.search(/テーパード|ワイド|ロングパンツ|カジュアルパンツ|ニットパンツ|スラックス|チノ|ジョガー|ジーンズ|デニム|パンツ|ズボン/);
        const prefixTokens = (titleCategoryIndex >= 0 ? title.slice(0, titleCategoryIndex) : "").split(/[\s　]+/).map((word) => word.replace(promoNoise, "").trim()).filter((word) => word && !/^(?:メンズ|レディース|男性用|女性用|紳士|婦人|ニット|ワイド|テーパード|ロング|カジュアル)$/i.test(word));
        if (prefixTokens.length) terms.push(`${prefixTokens[0]} ${prefix}パンツ`.trim());
        else if (terms.length < 5) terms.push(`${prefix}パンツ`.trim());
      } else {
        terms = [`${gender ? `${gender} ` : ""}${productCategory.label}`, category && `${category} ${productCategory.label}`];
      }
    } else {
      const base = title.split(/[\s　【】()（）]/).filter(Boolean)[0]?.slice(0, 28) || title.slice(0, 28);
      terms = relation === "same" ? [base, category && `${category} ${base}`]
      : relation === "together" ? [`${base} 併用`, category && `${category} 関連用品`]
      : relation === "problem" ? [p, p && `${p} 対策`] : [];
    }
    const valid = terms.filter((term) => term && term.trim().length >= 2).slice(0, 5);
    if (!valid.length) throw new Error("検索語の根拠が不足しています。起点商品の情報または悩みを確認してください。");
    return validateKeywords([...new Set(valid)]);
  }

  function suggestSeasonal(key, purpose = "general", customIntent = "", targetUser = "") {
    if (!Object.hasOwn(seasonal, key)) throw new Error("季節・イベントを選んでください。");
    const options = seasonalPurposeOptions(key);
    const selectedPurpose = purpose || "general";
    if (!options.some((option) => option.value === selectedPurpose)) throw new Error("選択した季節・イベントに対応する検索目的を選んでください。");
    const intent = clean(customIntent, 80);
    if (intent) {
      if (hasSeasonConflict(key, intent)) throw new Error("自由入力と季節・イベントが矛盾している可能性があります。季節・イベントまたは自由入力を確認してください。");
      return suggestIntent(intent, targetUser);
    }
    const purposeTerms = purposeKeywords[key]?.[selectedPurpose];
    const terms = purposeTerms || (selectedPurpose === "general" ? seasonal[key] : null);
    if (!terms) throw new Error("選択した目的の検索語を作れません。Codex用プロンプトで提案を依頼してください。");
    return validateKeywords(applyTarget([...terms], targetUser));
  }

  function mergeResults(results, identity) {
    const seen = new Set();
    const merged = [];
    results.forEach((group) => group.forEach((item) => {
      const key = identity(item);
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    }));
    return merged;
  }

  function makeSearchContext(input) {
    const context = {
      version: 1,
      searchMode: input.searchMode,
      targetUser: clean(input.targetUser, 80),
      problem: clean(input.problem, 120),
      selectionReason: clean(input.selectionReason, 160),
      searchKeywords: validateKeywords(input.searchKeywords),
      origin: input.origin?.itemCode ? { kind: input.origin.kind, itemCode: clean(input.origin.itemCode, 100) } : null
    };
    if (input.season) context.season = clean(input.season, 20);
    if (input.seasonPurpose) context.seasonPurpose = clean(input.seasonPurpose, 30);
    return context;
  }

  function supportedSelectionReason(reason, product) {
    const text = clean(reason, 160);
    if (!text) return "";
    // 商品固有の説明はAPIで確認した文字列そのものだけを認める。
    const evidence = [product.itemName, product.itemCaption, product.categoryName].filter(Boolean).join(" ");
    if (!evidence.includes(text)) throw new Error("選定理由は商品名・商品説明・カテゴリーで確認できた表現だけにしてください。");
    return text;
  }

  function suggestSelectionReason(product) {
    const caption = String(product?.itemCaption || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    if (/(最安|人気|売れ|絶対|必ず|効果|クーポン|セール|%\s*OFF|％\s*OFF|期間限定|使ってみた)/i.test(caption)) {
      // 販促や体験表現を含む説明文から、文全体を理由として転載しない。
      const safeCaption = caption.split(/[。\n]/).filter((part) => !/(最安|人気|売れ|絶対|必ず|効果|クーポン|セール|%\s*OFF|％\s*OFF|期間限定|使ってみた)/i.test(part)).join("。");
      return extractShortEvidence(safeCaption);
    }
    return extractShortEvidence(caption);
  }

  function extractShortEvidence(text) {
    const patterns = [
      /(?:デスク|机|卓上)[^、。！？\n]{0,40}(?:収納|整理|配線)[^、。！？\n]{0,18}/,
      /(?:折りたたみ|洗える|保温|保冷|軽量|通気性|防水|撥水|耐熱|耐冷|抗菌)[^、。！？\n]{0,12}/,
      /(?:収納|ポケット|引き出し|棚|容量|サイズ|素材|材質|対応|付属)[^、。！？\n]{0,14}/
    ];
    for (const pattern of patterns) {
      const match = String(text || "").match(pattern);
      const evidence = match?.[0]?.trim() || "";
      if (evidence && evidence.length <= 48) return evidence;
    }
    return "";
  }

  function classifyRelevance(product, context = {}) {
    const text = [product?.itemName, product?.itemCaption, product?.categoryName].filter(Boolean).join(" ").replace(/<[^>]*>/g, " ").toLowerCase();
    if (context.searchMode === "related" && context.relation === "compare") {
      const sourceCategory = identifyProductCategory(context.originProduct);
      const resultCategory = identifyProductCategory(product);
      if (!sourceCategory || !resultCategory || sourceCategory.ambiguous || resultCategory.ambiguous) return { status: "review", reason: "商品名・ジャンル情報からカテゴリを確定できず、比較可能か判定できません。" };
      if (sourceCategory.group !== resultCategory.group) return { status: "low", reason: `検索元は「${sourceCategory.label}（${sourceCategory.group}）」、検索結果は「${resultCategory.label}（${resultCategory.group}）」のため比較対象外です。` };
      const sourceGender = extractGender(context.originProduct, context.targetUser);
      const resultGender = extractGender(product);
      if (sourceGender && resultGender && sourceGender !== resultGender) return { status: "low", reason: `検索元は${sourceGender}、検索結果は${resultGender}のため対象が異なります。` };
      const groupLabel = { bottoms: "ボトムス", underwear: "下着", outerwear: "アウター", golf: "ゴルフ用品", shoes: "靴", tops: "トップス", bags: "バッグ" }[sourceCategory.group] || sourceCategory.group;
      return { status: "relevant", reason: `商品名・ジャンル情報で「${sourceCategory.label}」と「${resultCategory.label}」を確認し、同じ大分類「${groupLabel}」です。` };
    }
    const problem = String(context.problem || "");
    if (/(デスク|机)/.test(problem) && /(狭|収納|片付|スペース)/.test(problem)) {
      const deskCues = ["デスク収納ラック", "デスク周り", "デスク下", "机下", "デスク上", "机上", "机の上", "モニター台", "モニタースタンド", "卓上ラック", "デスクラック", "パソコンラック", "pcラック", "配線収納", "ケーブル収納", "文具収納", "デスクオーガナイザー"];
      const matched = deskCues.find((cue) => text.includes(cue.toLowerCase()));
      if (matched) return { status: "relevant", reason: `商品情報に「${matched}」の記載があります。` };
      return { status: "low", reason: "商品名・説明にデスク周辺の収納・整理との関連を確認できません。" };
    }
    const terms = Array.isArray(context.keywords) ? context.keywords : [];
    const matched = terms.find((term) => {
      const words = String(term).replace(promoNoise, " ").toLowerCase().split(/[\s　]+/).filter((word) => word.length >= 2 && !/^(便利|対策|比較|compare|併用|関連用品|おすすめ|人気|公式|送料無料|sale|off)$/.test(word));
      return words.some((word) => text.includes(word));
    });
    if (matched) return { status: "relevant", reason: `商品情報に検索語「${matched}」と一致する語があります。` };
    return { status: "review", reason: "商品情報だけでは検索条件との関連を判定できません。内容を確認してください。" };
  }

  root.RoomExpandedSearch = Object.freeze({ modes, seasonal, seasonalPurposes, seasonalPurposeOptions, validateKeywords, parseCodexResult, suggestProblem, suggestIntent, suggestRelated, suggestSeasonal, mergeResults, makeSearchContext, supportedSelectionReason, suggestSelectionReason, identifyProductCategory, classifyRelevance });
})(typeof window !== "undefined" ? window : globalThis);
