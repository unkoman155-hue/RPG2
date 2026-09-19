const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const PORT = process.env.PORT || 3000;

// index.html / style.css / game.js を公開
app.use(express.static(path.join(__dirname)));

const rooms = new Map();

const BOSSES = [
  {
    name: "魔王ネオン",
    level: 10,
    maxHp: 1200,
    minAtk: 15,
    maxAtk: 28,
    xp: 500,
    money: 500,
    bounty: 300,
    drop: "勇者の証"
  },
  {
    name: "古代竜ドラグノア",
    level: 15,
    maxHp: 2200,
    minAtk: 20,
    maxAtk: 38,
    xp: 900,
    money: 900,
    bounty: 600,
    drop: "竜の宝玉"
  },
  {
    name: "深淵の王",
    level: 20,
    maxHp: 3500,
    minAtk: 28,
    maxAtk: 50,
    xp: 1500,
    money: 1500,
    bounty: 1000,
    drop: "深淵の核"
  }
];

// 6文字のルームコードを作る
function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code;

  do {
    code = "";

    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));

  return code;
}

// プレイヤー情報
function playerInfo(player) {
  return {
    id: player.id,
    name: player.name,
    job: player.job,
    level: player.level,
    hp: player.hp,
    maxHp: player.maxHp
  };
}

// ルームの状態を送信
function broadcastRoom(room) {
  const players = Array.from(room.players.values()).map(playerInfo);

  io.to(room.code).emit("playersUpdate", players);

  io.to(room.code).emit(
    "bossUpdate",
    room.boss
      ? {
          name: room.boss.name,
          level: room.boss.level,
          hp: room.boss.hp,
          maxHp: room.boss.maxHp
        }
      : null
  );
}

// ルーム全体の状態
function createRoomState(room) {
  return {
    code: room.code,

    players: Array.from(room.players.values()).map(playerInfo),

    boss: room.boss
      ? {
          name: room.boss.name,
          level: room.boss.level,
          hp: room.boss.hp,
          maxHp: room.boss.maxHp
        }
      : null
  };
}

// ボス報酬
function getBossReward(boss) {
  return {
    xp: boss.xp,
    money: boss.money,
    bounty: boss.bounty,
    item: boss.drop
  };
}

io.on("connection", (socket) => {
  console.log("プレイヤー接続:", socket.id);

  // =========================
  // ルーム作成
  // =========================

  socket.on("createRoom", (info) => {
    const roomCode = makeRoomCode();

    const room = {
      code: roomCode,
      players: new Map(),
      boss: null
    };

    rooms.set(roomCode, room);

    const player = {
      id: socket.id,
      name: String(info.name || "名無し").slice(0, 12),
      job: String(info.job || "勇者"),
      level: Number(info.level) || 0,
      hp: Number(info.hp) || 30,
      maxHp: Number(info.maxHp) || 30
    };

    room.players.set(socket.id, player);

    socket.join(roomCode);

    socket.data.roomCode = roomCode;

    socket.emit(
      "roomState",
      createRoomState(room)
    );

    socket.emit(
      "serverLog",
      `ルーム ${roomCode} を作成しました！`
    );

    console.log(
      `ルーム作成: ${roomCode} / ${player.name}`
    );
  });

  // =========================
  // ルーム参加
  // =========================

  socket.on("joinRoom", (info) => {
    const roomCode = String(info.code || "").toUpperCase();

    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit(
        "roomError",
        "そのルームはありません。"
      );

      return;
    }

    if (room.players.size >= 20) {
      socket.emit(
        "roomError",
        "このルームは満員です。"
      );

      return;
    }

    const player = {
      id: socket.id,
      name: String(info.name || "名無し").slice(0, 12),
      job: String(info.job || "勇者"),
      level: Number(info.level) || 0,
      hp: Number(info.hp) || 30,
      maxHp: Number(info.maxHp) || 30
    };

    room.players.set(socket.id, player);

    socket.join(roomCode);

    socket.data.roomCode = roomCode;

    socket.emit(
      "roomState",
      createRoomState(room)
    );

    io.to(roomCode).emit(
      "serverLog",
      `${player.name}がルームに参加しました！`
    );

    broadcastRoom(room);

    console.log(
      `ルーム参加: ${roomCode} / ${player.name}`
    );
  });

  // =========================
  // ルーム退出
  // =========================

  socket.on("leaveRoom", () => {
    leaveRoom(socket);
  });

  // =========================
  // ボス出現
  // =========================

  socket.on("startBoss", () => {
    const roomCode = socket.data.roomCode;

    const room = rooms.get(roomCode);

    if (!room) {
      return;
    }

    if (room.boss) {
      socket.emit(
        "roomError",
        "すでにボスが出現しています。"
      );

      return;
    }

    const bossTemplate =
      BOSSES[
        Math.floor(
          Math.random() * BOSSES.length
        )
      ];

    room.boss = {
      ...bossTemplate,
      hp: bossTemplate.maxHp
    };

    io.to(roomCode).emit(
      "serverLog",
      `👑 ${room.boss.name}が現れた！`
    );

    broadcastRoom(room);
  });

  // =========================
  // ボス攻撃
  // =========================

  socket.on("bossAttack", (payload) => {
    const roomCode = socket.data.roomCode;

    const room = rooms.get(roomCode);

    if (!room || !room.boss) {
      return;
    }

    const player = room.players.get(socket.id);

    if (!player) {
      return;
    }

    let damage = Number(payload.damage) || 1;

    // 不正な極端なダメージを防止
    damage = Math.max(
      1,
      Math.min(500, damage)
    );

    room.boss.hp = Math.max(
      0,
      room.boss.hp - damage
    );

    const skillText = payload.skill
      ? `「${payload.skill}」で`
      : "";

    io.to(roomCode).emit(
      "serverLog",
      `${player.name}が${skillText}ボスに${damage}ダメージ！`
    );

    // =========================
    // ボス撃破
    // =========================

    if (room.boss.hp <= 0) {
      const reward = getBossReward(room.boss);

      io.to(roomCode).emit(
        "serverLog",
        "🎉 ボス討伐成功！"
      );

      io.to(roomCode).emit(
        "bossDefeated",
        reward
      );

      room.boss = null;

      broadcastRoom(room);

      return;
    }

    // =========================
    // ボス反撃
    // =========================

    const players =
      Array.from(room.players.values());

    if (players.length > 0) {
      const target =
        players[
          Math.floor(
            Math.random() * players.length
          )
        ];

      const damageToPlayer =
        Math.floor(
          Math.random() *
            (
              room.boss.maxAtk -
              room.boss.minAtk +
              1
            )
        ) +
        room.boss.minAtk;

      target.hp = Math.max(
        0,
        target.hp - damageToPlayer
      );

      const targetSocket =
        io.sockets.sockets.get(target.id);

      if (targetSocket) {
        targetSocket.emit(
          "serverLog",
          `👑 ${room.boss.name}の反撃！${damageToPlayer}ダメージ！`
        );
      }

      io.to(roomCode).emit(
        "serverLog",
        `${target.name}がボスの反撃を受けた！`
      );
    }

    broadcastRoom(room);
  });

  // =========================
  // 切断
  // =========================

  socket.on("disconnect", () => {
    console.log(
      "プレイヤー切断:",
      socket.id
    );

    leaveRoom(socket);
  });
});

// =========================
// ルームから退出
// =========================

function leaveRoom(socket) {
  const roomCode = socket.data.roomCode;

  if (!roomCode) {
    return;
  }

  const room = rooms.get(roomCode);

  if (!room) {
    return;
  }

  const player =
    room.players.get(socket.id);

  room.players.delete(socket.id);

  socket.leave(roomCode);

  delete socket.data.roomCode;

  if (player) {
    io.to(roomCode).emit(
      "serverLog",
      `${player.name}がルームを退出しました。`
    );
  }

  // 誰もいなくなったらルーム削除
  if (room.players.size === 0) {
    rooms.delete(roomCode);

    console.log(
      `ルーム削除: ${roomCode}`
    );

    return;
  }

  broadcastRoom(room);
}

// =========================
// ヘルスチェック
// =========================

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size
  });
});

// =========================
// サーバー起動
// =========================

server.listen(PORT, () => {
  console.log(
    `勇者の懸賞金RPG ONLINE 起動`
  );

  console.log(
    `PORT: ${PORT}`
  );
});
