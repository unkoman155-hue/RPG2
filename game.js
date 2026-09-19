const socket = io();

const SAVE_KEY = "yuusha_rpg_online_save_v2";

const defaultData = {
  started: false,
  gameOver: false,

  name: "",
  job: "勇者",

  maxHp: 30,
  hp: 30,

  level: 0,
  xp: 0,
  attack: 0,

  skillSlots: 1,
  skills: [],

  bounty: 0,
  money: 250,

  weapon: "タガー",
  inventory: ["タガー"],

  defeats: 0,

  townUnlocked: false,
  townTrust: 15,

  cityUnlocked: false,
  cityTrust: 50,

  encyclopedia: [],

  totalBattles: 0,

  roomCode: ""
};

let data = loadLocal();

let currentEnemy = null;
let battleBusy = false;

let online = {
  connected: false,
  inRoom: false,
  code: "",
  players: [],
  boss: null
};


// =========================
// スキル
// =========================

const SKILLS = {

  勇者: [
    {
      name: "斬撃",
      type: "damage",
      power: 35
    },
    {
      name: "パワースラッシュ",
      type: "damage",
      power: 50
    },
    {
      name: "連続斬り",
      type: "multi",
      power: 20,
      hits: 2
    },
    {
      name: "勇者の一撃",
      type: "damage",
      power: 65
    },
    {
      name: "気合",
      type: "heal",
      power: 8,
      attack: 5
    }
  ],

  剣士: [
    {
      name: "斬撃",
      type: "damage",
      power: 35
    },
    {
      name: "強斬り",
      type: "damage",
      power: 45
    },
    {
      name: "居合斬り",
      type: "damage",
      power: 70
    },
    {
      name: "回転斬り",
      type: "multi",
      power: 30,
      hits: 2
    },
    {
      name: "見切り",
      type: "heal",
      power: 10
    }
  ],

  ヒーラー: [
    {
      name: "ヒール",
      type: "heal",
      power: 15
    },
    {
      name: "聖撃",
      type: "damage",
      power: 25
    },
    {
      name: "聖なる光",
      type: "damageHeal",
      power: 40,
      heal: 5
    },
    {
      name: "大回復",
      type: "heal",
      power: 25
    },
    {
      name: "ホーリーバースト",
      type: "damage",
      power: 55
    }
  ]

};


// =========================
// モンスター
// =========================

const ENEMIES = [

  {
    name: "怪物猫",
    min: 1,
    max: 5,
    hp: 20,
    xp: 25,
    area: "草原",
    drop: "タガー",
    dropRate: 0.35,
    minAtk: 4,
    maxAtk: 9
  },

  {
    name: "草原スライム",
    min: 1,
    max: 4,
    hp: 25,
    xp: 30,
    area: "草原",
    drop: "薬草",
    dropRate: 0.65,
    minAtk: 4,
    maxAtk: 10
  },

  {
    name: "ゴブリン",
    min: 2,
    max: 6,
    hp: 35,
    xp: 40,
    area: "町外れ",
    drop: "剣",
    dropRate: 0.45,
    minAtk: 7,
    maxAtk: 13
  },

  {
    name: "黒狼",
    min: 3,
    max: 7,
    hp: 45,
    xp: 55,
    area: "都市周辺",
    drop: "薬草",
    dropRate: 0.55,
    minAtk: 9,
    maxAtk: 17
  },

  {
    name: "黄金スライム",
    min: 4,
    max: 8,
    hp: 70,
    xp: 100,
    area: "レア",
    drop: "金貨",
    dropRate: 0.8,
    minAtk: 12,
    maxAtk: 22,
    rare: true
  }

];


// =========================
// 基本処理
// =========================

function cloneDefault() {

  return JSON.parse(
    JSON.stringify(defaultData)
  );

}


function loadLocal() {

  try {

    const raw =
      localStorage.getItem(SAVE_KEY);

    if (!raw) {

      return cloneDefault();

    }

    return {
      ...cloneDefault(),
      ...JSON.parse(raw)
    };

  } catch (e) {

    return cloneDefault();

  }

}


function saveLocal() {

  try {

    data.roomCode =
      online.code ||
      data.roomCode ||
      "";

    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(data)
    );

  } catch (e) {}

}


function randomInt(min, max) {

  return Math.floor(
    Math.random() *
    (max - min + 1)
  ) + min;

}


function escapeHtml(value) {

  return String(value ?? "")
    .replace(/[&<>"']/g, function (m) {

      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[m];

    });

}


function log(message) {

  const element =
    document.getElementById("log");

  element.innerHTML =
    `<div class="log-line">${escapeHtml(message)}</div>` +
    element.innerHTML;

}


function setScreen(html) {

  document.getElementById(
    "screen"
  ).innerHTML = html;

}


function status() {

  const element =
    document.getElementById("status");

  element.innerHTML = `

    <div class="stat">
      ❤️ HP
      <b>${data.hp}/${data.maxHp}</b>
    </div>

    <div class="stat">
      ⭐ Lv
      <b>${data.level}</b>
    </div>

    <div class="stat">
      💰 お金
      <b>${data.money}円</b>
    </div>

    <div class="stat">
      🎯 懸賞金
      <b>${data.bounty}円</b>
    </div>

  `;

}


function autoSave() {

  saveLocal();

  status();

}


function xpNeed() {

  return 50 + data.level * 50;

}


function getRandomSkills(job, count) {

  const pool =
    [...SKILLS[job]];

  const result = [];

  while (
    pool.length > 0 &&
    result.length < count
  ) {

    const index =
      randomInt(0, pool.length - 1);

    result.push(
      pool.splice(index, 1)[0]
    );

  }

  return result;

}


// =========================
// Socket.IO
// =========================

function initializeOnline() {

  socket.on("connect", function () {

    online.connected = true;

    log("🌐 サーバーに接続しました！");

    render();

  });


  socket.on("disconnect", function () {

    online.connected = false;

    log("🔴 サーバーとの接続が切れました。");

    render();

  });


  socket.on("roomState", function (state) {

    online.inRoom = true;

    online.code = state.code;

    online.players =
      state.players || [];

    online.boss =
      state.boss || null;

    data.roomCode =
      state.code;

    saveLocal();

    log(
      `🌐 ルーム ${state.code} に入りました！`
    );

    showRoom();

  });


  socket.on("playersUpdate", function (players) {

    online.players =
      players || [];

    if (online.inRoom) {

      showRoom();

    }

  });


  socket.on("bossUpdate", function (boss) {

    online.boss = boss;

    if (
      document.getElementById("screen")
        ?.dataset.screen === "boss"
    ) {

      showBoss();

    }

  });


  socket.on("serverLog", function (message) {

    log(message);

  });


  socket.on("roomError", function (message) {

    alert(message);

  });


  socket.on("bossDefeated", function (reward) {

    log("👑 ボスを倒した！");

    if (reward) {

      if (reward.xp) {

        data.xp += reward.xp;

      }

      if (reward.money) {

        data.money += reward.money;

      }

      if (reward.bounty) {

        data.bounty += reward.bounty;

      }

      if (reward.item) {

        data.inventory.push(
          reward.item
        );

        log(
          `🎁 ${reward.item}を獲得した！`
        );

      }

    }

    checkLevelUp();

    autoSave();

    online.boss = null;

    showBoss();

  });

}


// =========================
// ゲーム開始
// =========================

function initializeGame() {

  initializeOnline();

  status();

  render();

}


function render() {

  status();

  if (data.gameOver) {

    showGameOver();

    return;

  }

  if (!data.started) {

    showStart();

    return;

  }

}


// =========================
// スタート画面
// =========================

function showStart() {

  setScreen(`

    <h2>⚔️ 勇者の懸賞金RPG ONLINE</h2>

    <p>
      仲間と一緒に冒険して、
      オンラインボスを倒そう！
    </p>

    <label>名前</label>

    <input
      id="nameInput"
      maxlength="12"
      placeholder="勇者の名前"
    >

    <label>職業</label>

    <select id="jobInput">

      <option>勇者</option>
      <option>剣士</option>
      <option>ヒーラー</option>

    </select>

    <button
      class="primary"
      onclick="startGame()"
    >
      冒険を始める
    </button>

    <div class="notice">
      💾 セーブは自動保存されます。
    </div>

  `);

}


function startGame() {

  const name =
    (
      document.getElementById(
        "nameInput"
      ).value ||
      "名無し"
    )
      .trim()
      .slice(0, 12);

  const job =
    document.getElementById(
      "jobInput"
    ).value;


  data = cloneDefault();

  data.started = true;

  data.name = name;

  data.job = job;

  data.skills =
    getRandomSkills(
      job,
      randomInt(1, 3)
    );


  autoSave();

  log(
    `${name}は${job}として冒険を始めた！`
  );

  showHome();

}


// =========================
// ホーム
// =========================

function showHome() {

  if (!data.started) {

    showStart();

    return;

  }

  const roomText =
    online.inRoom
      ? `ルーム: ${escapeHtml(online.code)}`
      : "ルーム未参加";


  setScreen(`

    <h2>🏠 ホーム</h2>

    <div class="item">
      👤 ${escapeHtml(data.name)}
      /
      ${escapeHtml(data.job)}
    </div>

    <div class="item">
      ⚔️ 攻撃力: ${data.attack}
      <br>
      🗡️ 武器: ${escapeHtml(data.weapon)}
    </div>

    <div class="item">
      ⭐ XP:
      ${data.xp}/${xpNeed()}
      <br>
      👹 討伐数:
      ${data.defeats}
    </div>

    <div class="item">
      🌐
      ${
        online.connected
          ? '<span class="online-dot"></span>オンライン'
          : '<span class="offline-dot"></span>未接続'
      }
      <br>
      ${roomText}
    </div>

    ${
      online.inRoom
        ? `
          <div class="item">
            👥 同室プレイヤー:
            ${online.players.length}人
          </div>
        `
        : ""
    }

    <div class="actions">

      <button
        class="primary"
        onclick="showBattle()"
      >
        ⚔️ 戦う
      </button>

      <button
        onclick="showRoom()"
      >
        🌐 オンライン
      </button>

      <button
        onclick="showBoss()"
      >
        👑 ボス
      </button>

      <button
        onclick="showTown()"
      >
        🏘️ 町
      </button>

      <button
        onclick="showCity()"
      >
        🏙️ 都市
      </button>

      <button
        onclick="showGacha()"
      >
        🎰 ガチャ
      </button>

      <button
        onclick="showBag()"
      >
        🎒 バッグ
      </button>

      <button
        onclick="showSettings()"
      >
        ⚙️ 設定
      </button>

    </div>

  `);

}


function showBattle() {

  startBattle();

}


// =========================
// 通常戦闘
// =========================

function startBattle() {

  if (data.gameOver) {

    return;

  }

  const area =
    data.cityUnlocked
      ? "都市周辺"
      : data.townUnlocked
        ? "町外れ"
        : "草原";


  let pool =
    ENEMIES.filter(
      enemy =>
        enemy.area === area ||
        enemy.area === "レア"
    );


  if (Math.random() < 0.12) {

    pool =
      ENEMIES.filter(
        enemy => enemy.rare
      );

  }


  const base =
    pool[
      randomInt(
        0,
        pool.length - 1
      )
    ];


  const level =
    randomInt(
      base.min,
      base.max
    );


  const hp =
    base.hp +
    (level - base.min) * 4;


  currentEnemy = {

    ...base,

    level,

    maxHp: hp,

    hp

  };


  battleBusy = false;

  renderBattle();

}


function renderBattle() {

  if (!currentEnemy) {

    startBattle();

    return;

  }


  const percent =
    Math.max(
      0,
      currentEnemy.hp /
      currentEnemy.maxHp *
      100
    );


  setScreen(`

    <h2>⚔️ 戦闘</h2>

    <div class="enemy">

      <div class="enemy-name">

        ${
          currentEnemy.rare
            ? "✨ "
            : ""
        }

        ${escapeHtml(
          currentEnemy.name
        )}

      </div>

      <div>
        Lv.${currentEnemy.level}
      </div>

    </div>

    <div>
      敵HP
      ${currentEnemy.hp}
      /
      ${currentEnemy.maxHp}
    </div>

    <div class="hpbar">

      <div
        class="hpfill"
        style="width:${percent}%"
      ></div>

    </div>

    <div class="actions">

      <button
        class="primary"
        onclick="playerAttack()"
      >
        ⚔️ コウゲキ
      </button>

      <button
        onclick="defend()"
      >
        🛡️ ボウギョ
      </button>

      <button
        onclick="showSkills()"
      >
        ✨ スキル
      </button>

      <button
        onclick="inspectEnemy()"
      >
        🔎 シラベル
      </button>

      <button
        onclick="runAway()"
      >
        🏃 ニゲル
      </button>

      <button
        onclick="showBoss()"
      >
        👑 オンラインボス
      </button>

    </div>

  `);

}


function playerAttack() {

  if (
    battleBusy ||
    !currentEnemy
  ) {

    return;

  }


  battleBusy = true;


  let damage =
    (
      data.weapon === "タガー"
        ? 15
        : 5
    ) +
    data.attack;


  const critical =
    Math.random() < 0.15;


  if (critical) {

    damage += 5;

  }


  currentEnemy.hp =
    Math.max(
      0,
      currentEnemy.hp - damage
    );


  log(
    `${data.weapon}で${damage}ダメージ！` +
    (
      critical
        ? " 💥クリティカル！"
        : ""
    )
  );


  if (
    data.weapon === "タガー" &&
    Math.random() < 0.25 &&
    currentEnemy.hp > 0
  ) {

    currentEnemy.hp =
      Math.max(
        0,
        currentEnemy.hp - 5
      );

    log(
      "🩸 出血！追加5ダメージ！"
    );

  }


  if (
    currentEnemy.hp <= 0
  ) {

    winBattle();

    return;

  }


  setTimeout(
    () => enemyTurn(false),
    350
  );

}


function showSkills() {

  setScreen(`

    <h2>✨ スキル</h2>

    <p>
      ${escapeHtml(data.job)}
    </p>

    ${
      data.skills.length
        ? data.skills.map(
            skill => `
              <button
                class="choice"
                onclick="useSkill('${escapeHtml(skill.name)}')"
              >
                ${escapeHtml(skill.name)}
                —
                ${skillText(skill)}
              </button>
            `
          ).join("")
        : "<p>スキルがありません。</p>"
    }

    <button
      class="choice"
      onclick="renderBattle()"
    >
      ↩️ 戻る
    </button>

  `);

}


function skillText(skill) {

  if (
    skill.type === "heal"
  ) {

    return `回復 ${skill.power}`;

  }


  if (
    skill.type === "multi"
  ) {

    return `${skill.power}ダメージ × ${skill.hits}`;

  }


  if (
    skill.type === "damageHeal"
  ) {

    return `${skill.power}ダメージ + ${skill.heal}回復`;

  }


  return `${skill.power}ダメージ`;

}


function useSkill(name) {

  if (
    battleBusy ||
    !currentEnemy
  ) {

    return;

  }


  const skill =
    data.skills.find(
      item => item.name === name
    );


  if (!skill) {

    return;

  }


  battleBusy = true;


  if (
    skill.type === "heal"
  ) {

    const before =
      data.hp;

    data.hp =
      Math.min(
        data.maxHp,
        data.hp + skill.power
      );


    log(
      `${skill.name}で${data.hp - before}回復！`
    );


    if (skill.attack) {

      data.attack +=
        skill.attack;

      log(
        `攻撃力が${skill.attack}上がった！`
      );

    }

  }


  else if (
    skill.type === "multi"
  ) {

    let total = 0;


    for (
      let i = 0;
      i < skill.hits;
      i++
    ) {

      const damage =
        skill.power +
        data.attack;


      currentEnemy.hp =
        Math.max(
          0,
          currentEnemy.hp -
          damage
        );


      total += damage;

    }


    log(
      `${skill.name}！合計${total}ダメージ！`
    );

  }


  else {

    const damage =
      skill.power +
      data.attack;


    currentEnemy.hp =
      Math.max(
        0,
        currentEnemy.hp -
        damage
      );


    log(
      `${skill.name}！${damage}ダメージ！`
    );


    if (
      skill.type === "damageHeal"
    ) {

      data.hp =
        Math.min(
          data.maxHp,
          data.hp + skill.heal
        );

      log(
        `${skill.heal}回復！`
      );

    }

  }


  autoSave();


  if (
    currentEnemy.hp <= 0
  ) {

    winBattle();

    return;

  }


  setTimeout(
    () => enemyTurn(false),
    350
  );

}


function defend() {

  if (
    battleBusy ||
    !currentEnemy
  ) {

    return;

  }


  battleBusy = true;

  log(
    "🛡️ 防御した！次のダメージ半減！"
  );


  setTimeout(
    () => enemyTurn(true),
    350
  );

}


function enemyTurn(defending) {

  if (
    !currentEnemy ||
    currentEnemy.hp <= 0
  ) {

    return;

  }


  let damage =
    randomInt(
      currentEnemy.minAtk,
      currentEnemy.maxAtk
    );


  if (
    currentEnemy.level > 4
  ) {

    damage += 2;

  }


  if (defending) {

    damage =
      Math.floor(
        damage / 2
      );

  }


  data.hp =
    Math.max(
      0,
      data.hp - damage
    );


  log(
    `${currentEnemy.name}の攻撃！${damage}ダメージ！`
  );


  autoSave();


  if (data.hp <= 0) {

    gameOver();

    return;

  }


  battleBusy = false;

  renderBattle();

}


function inspectEnemy() {

  if (!currentEnemy) {

    return;

  }


  log(
    `${currentEnemy.name}：Lv${currentEnemy.level} / HP${currentEnemy.hp} / XP${currentEnemy.xp} / ${currentEnemy.area}`
  );

}


function runAway() {

  if (battleBusy) {

    return;

  }


  if (Math.random() < 0.7) {

    log("🏃 逃げ切った！");

    currentEnemy = null;

    showHome();

  }

  else {

    log("逃げられない！");

    battleBusy = true;

    setTimeout(
      () => enemyTurn(false),
      350
    );

  }

}


// =========================
// 勝利
// =========================

function winBattle() {

  const enemy =
    currentEnemy;


  currentEnemy = null;


  data.defeats++;

  data.totalBattles++;

  data.xp += enemy.xp;


  if (
    !data.encyclopedia.includes(
      enemy.name
    )
  ) {

    data.encyclopedia.push(
      enemy.name
    );

  }


  log(
    `${enemy.name}を倒した！`
  );

  log(
    `${enemy.xp}XPを獲得した！`
  );


  if (
    Math.random() <
    enemy.dropRate
  ) {

    if (
      enemy.drop === "金貨"
    ) {

      data.money += 100;

      log(
        "金貨を落とした！100円獲得！"
      );

    }

    else {

      data.inventory.push(
        enemy.drop
      );

      log(
        `${enemy.drop}を落とした！`
      );

    }

  }


  if (
    data.defeats >= 3 &&
    !data.townUnlocked
  ) {

    data.townUnlocked = true;

    log(
      "🏘️ 町が解放された！"
    );

  }


  if (
    data.defeats >= 8 &&
    !data.cityUnlocked
  ) {

    data.cityUnlocked = true;

    log(
      "🏙️ 都市が解放された！"
    );

  }


  data.bounty +=
    enemy.rare
      ? 100
      : 10;


  checkLevelUp();

  autoSave();


  setScreen(`

    <div class="victory">

      <div class="big">
        🎉 勝利！
      </div>

      <p>
        ${escapeHtml(enemy.name)}
        を倒した！
      </p>

      <p>
        XP +${enemy.xp}
      </p>

      <button
        onclick="showBattle()"
      >
        次の戦闘
      </button>

    </div>

  `);

}


// =========================
// レベルアップ
// =========================

function checkLevelUp() {

  while (
    data.xp >= xpNeed()
  ) {

    data.xp -=
      xpNeed();

    data.level++;


    const choice =
      prompt(
        `Lv${data.level}アップ！\n\n` +
        `1：HP +5\n` +
        `2：攻撃 +20\n` +
        `3：新スキル\n\n` +
        `番号を入力してください`
      );


    if (choice === "2") {

      data.attack += 20;

      log(
        "⚔️ 攻撃力+20！"
      );

    }


    else if (
      choice === "3"
    ) {

      const existing =
        new Set(
          data.skills.map(
            skill => skill.name
          )
        );


      const candidates =
        SKILLS[data.job].filter(
          skill =>
            !existing.has(
              skill.name
            )
        );


      if (
        candidates.length > 0
      ) {

        const newSkill =
          candidates[
            randomInt(
              0,
              candidates.length - 1
            )
          ];


        data.skills.push(
          newSkill
        );


        log(
          `✨ ${newSkill.name}を習得！`
        );

      }

      else {

        data.skillSlots++;

        log(
          "✨ スキル枠+1！"
        );

      }

    }


    else {

      data.maxHp += 5;

      data.hp =
        data.maxHp;

      log(
        "❤️ 最大HP+5！全回復！"
      );

    }

  }

}


// =========================
// GAME OVER
// =========================

function gameOver() {

  data.gameOver = true;

  saveLocal();

  showGameOver();

}


function showGameOver() {

  setScreen(`

    <div class="game-over">

      <div class="big">
        💀 GAME OVER
      </div>

      <p>
        HPが0になった。
      </p>

      <p>
        この冒険のセーブデータは残っています。
      </p>

      <button
        class="danger"
        onclick="newGame()"
      >
        最初からやり直す
      </button>

    </div>

  `);

}


function newGame() {

  if (
    !confirm(
      "セーブデータを削除して最初から始めますか？"
    )
  ) {

    return;

  }


  localStorage.removeItem(
    SAVE_KEY
  );


  data =
    cloneDefault();


  currentEnemy = null;

  online.inRoom = false;

  online.code = "";

  online.players = [];

  online.boss = null;


  if (socket.connected) {

    socket.emit(
      "leaveRoom"
    );

  }


  status();

  showStart();

}


// =========================
// オンラインルーム
// =========================

function showRoom() {

  const screen =
    document.getElementById(
      "screen"
    );


  screen.dataset.screen =
    "room";


  setScreen(`

    <h2>🌐 オンラインルーム</h2>

    <div class="notice">

      ${
        online.connected
          ? "🟢 サーバー接続中"
          : "🔴 サーバー未接続"
      }

    </div>

    ${
      online.inRoom

        ? `

          <div class="room-card">

            <b>
              ルームコード：
              ${escapeHtml(online.code)}
            </b>

            <br>

            <span class="small">
              このコードを友達に教えて参加してもらおう！
            </span>

          </div>

          <h3>
            👥 参加者
            ${online.players.length}人
          </h3>

          ${
            online.players.length
              ? online.players.map(
                  player => `
                    <div class="player-card">

                      <span>
                        👤
                        ${escapeHtml(player.name)}
                      </span>

                      <span>
                        ${escapeHtml(player.job)}
                        /
                        Lv${player.level}
                        /
                        ❤️${player.hp}
                      </span>

                    </div>
                  `
                ).join("")
              : "<p>参加者はいません。</p>"
          }

          <div class="actions">

            <button
              class="primary"
              onclick="showBoss()"
            >
              👑 ボス戦
            </button>

            <button
              class="danger"
              onclick="leaveRoom()"
            >
              🚪 退出
            </button>

          </div>

        `

        : `

          <h3>
            ルームを作る
          </h3>

          <button
            class="primary"
            onclick="createRoom()"
          >
            ➕ ルーム作成
          </button>

          <h3>
            ルームに参加
          </h3>

          <input
            id="roomCodeInput"
            maxlength="6"
            placeholder="6桁コード"
          >

          <button
            onclick="joinRoom()"
          >
            🔑 参加する
          </button>

        `
    }

  `);

}


function createRoom() {

  if (!online.connected) {

    alert(
      "サーバーに接続されていません。"
    );

    return;

  }


  socket.emit(
    "createRoom",
    {
      name: data.name,
      job: data.job,
      level: data.level,
      hp: data.hp,
      maxHp: data.maxHp
    }
  );

}


function joinRoom() {

  const code =
    (
      document.getElementById(
        "roomCodeInput"
      ).value || ""
    )
      .trim()
      .toUpperCase();


  if (
    !/^[A-Z0-9]{6}$/.test(code)
  ) {

    alert(
      "6桁のルームコードを入力してください。"
    );

    return;

  }


  socket.emit(
    "joinRoom",
    {
      code,
      name: data.name,
      job: data.job,
      level: data.level,
      hp: data.hp,
      maxHp: data.maxHp
    }
  );

}


function leaveRoom() {

  socket.emit(
    "leaveRoom"
  );


  online.inRoom = false;

  online.code = "";

  online.players = [];

  online.boss = null;

  data.roomCode = "";

  saveLocal();

  showHome();

}


// =========================
// オンラインボス
// =========================

function showBoss() {

  const screen =
    document.getElementById(
      "screen"
    );


  screen.dataset.screen =
    "boss";


  if (!online.inRoom) {

    setScreen(`

      <h2>👑 オンラインボス</h2>

      <div class="notice">
        まずオンラインルームに参加してください。
      </div>

      <button
        onclick="showRoom()"
      >
        🌐 ルームへ
      </button>

    `);

    return;

  }


  const boss =
    online.boss;


  if (!boss) {

    setScreen(`

      <h2>👑 オンラインボス</h2>

      <div class="notice">
        このルームには現在ボスがいません。
      </div>

      <button
        class="primary"
        onclick="startBoss()"
      >
        🔥 ボスを出現させる
      </button>

      <button
        onclick="showRoom()"
      >
        👥 参加者を見る
      </button>

    `);

    return;

  }


  const percent =
    Math.max(
      0,
      boss.hp /
      boss.maxHp *
      100
    );


  setScreen(`

    <h2>👑 オンラインボス</h2>

    <div class="boss-card">

      <div class="enemy-name">
        ${escapeHtml(boss.name)}
      </div>

      <div>
        Lv.${boss.level}
      </div>

      <div>
        HP
        ${boss.hp.toLocaleString()}
        /
        ${boss.maxHp.toLocaleString()}
      </div>

      <div class="hpbar">

        <div
          class="hpfill bosshp"
          style="width:${percent}%"
        ></div>

      </div>

      <p>
        👥 みんなで攻撃しよう！
      </p>

    </div>


    <div class="actions">

      <button
        class="primary"
        onclick="bossAttack()"
      >
        ⚔️ ボスを攻撃
      </button>

      <button
        onclick="bossSkill()"
      >
        ✨ スキル攻撃
      </button>

      <button
        onclick="showRoom()"
      >
        👥 参加者
      </button>

    </div>


    <div class="item">

      🎁 撃破報酬

      <br>

      XP / お金 /
      懸賞金 /
      レアアイテム

    </div>

  `);

}


function startBoss() {

  if (!online.inRoom) {

    return;

  }


  socket.emit(
    "startBoss"
  );

}


function bossAttack() {

  if (!online.boss) {

    return;

  }


  let damage =
    (
      data.weapon === "タガー"
        ? 15
        : 5
    ) +
    data.attack;


  if (
    Math.random() < 0.15
  ) {

    damage += 5;

    log(
      "💥 ボス攻撃クリティカル！"
    );

  }


  socket.emit(
    "bossAttack",
    {
      damage,
      name: data.name
    }
  );

}


function bossSkill() {

  if (
    !online.boss ||
    data.skills.length === 0
  ) {

    return;

  }


  const attackSkills =
    data.skills.filter(
      skill =>
        skill.type === "damage" ||
        skill.type === "multi" ||
        skill.type === "damageHeal"
    );


  if (
    attackSkills.length === 0
  ) {

    log(
      "⚠️ 攻撃できるスキルがありません。"
    );

    return;

  }


  const skill =
    attackSkills[
      randomInt(
        0,
        attackSkills.length - 1
      )
    ];


  let damage = 0;


  if (
    skill.type === "multi"
  ) {

    damage =
      (
        skill.power +
        data.attack
      ) *
      skill.hits;

  }


  else {

    damage =
      skill.power +
      data.attack;

  }


  socket.emit(
    "bossAttack",
    {
      damage,
      name: data.name,
      skill: skill.name
    }
  );

}


// =========================
// 町
// =========================

function showTown() {

  if (!data.townUnlocked) {

    setScreen(`

      <h2>🏘️ 町</h2>

      <div class="lock">
        🔒 モンスターを3体倒すと解放されます。
      </div>

    `);

    return;

  }


  setScreen(`

    <h2>🏘️ 町</h2>

    <div class="item">
      🤝 町の信頼度：
      ${data.townTrust}
    </div>

    <div class="actions">

      <button
        onclick="buyHerb()"
      >
        🌿 薬草を買う（30円）
      </button>

      <button
        onclick="townEvent()"
      >
        🎁 NPCイベント
      </button>

    </div>

  `);

}


function buyHerb() {

  if (
    data.money < 30
  ) {

    log(
      "お金が足りない！"
    );

    return;

  }


  data.money -= 30;

  data.inventory.push(
    "薬草"
  );


  log(
    "薬草を買った！"
  );


  autoSave();

  showTown();

}


function townEvent() {

  const gifts = [
    "薬草",
    "剣",
    "100円"
  ];


  const gift =
    gifts[
      randomInt(
        0,
        gifts.length - 1
      )
    ];


  if (
    gift === "100円"
  ) {

    data.money += 100;

  }

  else {

    data.inventory.push(
      gift
    );

  }


  data.townTrust =
    Math.min(
      100,
      data.townTrust + 1
    );


  log(
    `町の人から${gift}をもらった！`
  );


  autoSave();

  showTown();

}


// =========================
// 都市
// =========================

function showCity() {

  if (!data.cityUnlocked) {

    setScreen(`

      <h2>🏙️ 都市</h2>

      <div class="lock">
        🔒 モンスターを8体倒すと解放されます。
      </div>

    `);

    return;

  }


  setScreen(`

    <h2>🏙️ 都市</h2>

    <div class="item">
      🤝 都市の信頼度：
      ${data.cityTrust}
    </div>

    <div class="actions">

      <button
        onclick="buySword()"
      >
        🗡️ 剣を買う（100円）
      </button>

      <button
        onclick="cityEvent()"
      >
        🎁 都市イベント
      </button>

    </div>

  `);

}


function buySword() {

  if (
    data.money < 100
  ) {

    log(
      "お金が足りない！"
    );

    return;

  }


  data.money -= 100;

  data.inventory.push(
    "剣"
  );

  data.weapon = "剣";


  log(
    "剣を買って装備した！"
  );


  autoSave();

  showCity();

}


function cityEvent() {

  data.cityTrust =
    Math.min(
      100,
      data.cityTrust + 1
    );


  const money =
    randomInt(50, 150);


  data.money += money;


  log(
    `都市の人から${money}円もらった！`
  );


  autoSave();

  showCity();

}


// =========================
// ガチャ
// =========================

function showGacha() {

  setScreen(`

    <h2>🎰 ノーマルガチャ</h2>

    <p>
      1回50円
    </p>

    <div class="actions">

      <button
        class="primary"
        onclick="gacha()"
      >
        🎰 ガチャを回す
      </button>

      <button
        onclick="showHome()"
      >
        戻る
      </button>

    </div>

  `);

}


function gacha() {

  if (
    data.money < 50
  ) {

    log(
      "お金が足りない！"
    );

    return;

  }


  data.money -= 50;


  const item =
    Math.random() < 0.5
      ? "タガー"
      : "剣";


  data.inventory.push(
    item
  );


  log(
    `🎉 ${item}が出た！`
  );


  data.weapon = item;


  autoSave();

  showGacha();

}


// =========================
// バッグ
// =========================

function showBag() {

  setScreen(`

    <h2>🎒 バッグ</h2>

    <div class="item">

      装備中：
      🗡️
      ${escapeHtml(data.weapon)}

    </div>

    ${
      data.inventory.length

        ? data.inventory.map(
            (item, index) => `

              <div class="item">

                ${index + 1}.
                ${escapeHtml(item)}

                ${
                  item === data.weapon
                    ? " ⚔️装備中"
                    : ""
                }

              </div>

            `
          ).join("")

        : "<p>空っぽ</p>"
    }

  `);

}


// =========================
// 設定
// =========================

function showSettings() {

  setScreen(`

    <h2>⚙️ 設定</h2>

    <div class="actions">

      <button
        onclick="showSkillInfo()"
      >
        ✨ スキル情報
      </button>

      <button
        onclick="showLevelInfo()"
      >
        ⭐ レベル確認
      </button>

      <button
        onclick="showEncyclopedia()"
      >
        📖 図鑑
      </button>

      <button
        onclick="saveNow()"
      >
        💾 今すぐ保存
      </button>

      <button
        onclick="loadNow()"
      >
        📂 保存を読み込む
      </button>

      <button
        class="danger"
        onclick="newGame()"
      >
        🗑️ セーブ削除
      </button>

    </div>

  `);

}


function showSkillInfo() {

  setScreen(`

    <h2>✨ スキル情報</h2>

    ${
      data.skills.map(
        skill => `

          <div class="item">

            <b>
              ${escapeHtml(skill.name)}
            </b>

            <br>

            ${skillText(skill)}

          </div>

        `
      ).join("")
    }

    <button
      onclick="showSettings()"
    >
      戻る
    </button>

  `);

}


function showLevelInfo() {

  setScreen(`

    <h2>⭐ レベル</h2>

    <div class="item">
      Lv.${data.level}
    </div>

    <div class="item">
      XP ${data.xp}/${xpNeed()}
    </div>

    <div class="item">
      攻撃力 ${data.attack}
    </div>

    <div class="item">
      最大HP ${data.maxHp}
    </div>

    <button
      onclick="showSettings()"
    >
      戻る
    </button>

  `);

}


function showEncyclopedia() {

  setScreen(`

    <h2>📖 モンスター図鑑</h2>

    ${
      ENEMIES.map(
        enemy => `

          <div class="item">

            ${
              data.encyclopedia.includes(
                enemy.name
              )
                ? "📕"
                : "❓"
            }

            ${escapeHtml(enemy.name)}

            <br>

            ${
              data.encyclopedia.includes(
                enemy.name
              )
                ? `XP ${enemy.xp}`
                : "未発見"
            }

          </div>

        `
      ).join("")
    }

    <button
      onclick="showSettings()"
    >
      戻る
    </button>

  `);

}


function saveNow() {

  saveLocal();

  log(
    "💾 セーブしました！"
  );

  showSettings();

}


function loadNow() {

  data =
    loadLocal();

  log(
    "📂 セーブを読み込みました！"
  );

  status();

  render();

}


// =========================
// 起動
// =========================

document.addEventListener(
  "DOMContentLoaded",
  initializeGame
);
