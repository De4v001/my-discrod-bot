require("dotenv").config();
const fs = require("fs");

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  PermissionsBitField,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder
} = require("discord.js");

const STAFF_ROLE = "1507122833866625085";
const PLAY_CHANNEL = "1507116887266557952";

const BLOCKED_VOICE_CHANNELS = [
  "1507119309342638100",
  "1507119269735825579",
  "1507119309342638100"
];

/* ================= BOT ================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

/* ================= DATABASE ================= */

const DB_FILE = "./players.json";

let players = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : {};

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(players, null, 4));
}

function ensurePlayer(id) {
  if (!players[id]) {
    players[id] = {
      points: 0,
      wins: 0,
      losses: 0,
      mvps: 0,
      matches: 0
    };
    saveDB();
  }
}

/* ================= MATCH SYSTEM ================= */

let matches = {};
let voteSessions = {};

function createMatch(hostId) {
  const id = Date.now().toString();

  matches[id] = {
    id,
    host: hostId,
    team1: [],
    team2: [],
    roomId: null,
    password: null,
    privateKey: null,
    messageId: null,
    voiceChannel: null,
    active: false
  };

  return id;
}

function addPoints(id, amount) {
  ensurePlayer(id);
  players[id].points += amount;
  saveDB();
}

function getLeaderboard() {
  return Object.entries(players)
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, 10);
}

/* ================= EMBED ================= */

function buildMatchEmbed(id) {
  const m = matches[id];

  return new EmbedBuilder()
    .setTitle("🎮 FREE FIRE 4V4 MATCH")
    .addFields(
      {
        name: "🔴 Team 1",
        value: m.team1.length
          ? m.team1.map(x => `<@${x}>`).join("\n")
          : "Empty",
        inline: true
      },
      {
        name: "🔵 Team 2",
        value: m.team2.length
          ? m.team2.map(x => `<@${x}>`).join("\n")
          : "Empty",
        inline: true
      }
    )
    .setColor("#2b2d31")
    .setFooter({ text: `Host: ${m.host}` });
}

/* ================= UPDATE PANEL ================= */

async function updateMatchPanel(channel, id) {
  const m = matches[id];
  if (!m) return;

  const msg = await channel.messages.fetch(m.messageId).catch(() => null);
  if (!msg) return;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`join1_${id}`)
      .setLabel("Join Team 1")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`join2_${id}`)
      .setLabel("Join Team 2")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`leave_${id}`)
      .setLabel("Leave Match")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`cancel_${id}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );

  await msg.edit({
    embeds: [buildMatchEmbed(id)],
    components: [row]
  });
}

/* ================= VOICE BLOCK CHECK ================= */

async function isPlayerBlockedFromMatch(member) {
  if (!member?.voice?.channelId) return false;

  return BLOCKED_VOICE_CHANNELS.includes(member.voice.channelId);
}

/* ================= PREFIX COMMANDS ================= */

client.on("messageCreate", async message => {
  if (message.author.bot) return;

  const args = message.content.split(" ");  /* ================= PLAY 4V4 ================= */

  if (args[0] === "!play" && args[1] === "4v4") {
    if (message.channel.id !== PLAY_CHANNEL)
      return message.reply("You can only create matches in the play channel.");

    const id = createMatch(message.author.id);

    const embed = new EmbedBuilder()
      .setTitle("🎮 CREATE MATCH")
      .setDescription("Setup Room + Private Key")
      .setColor("#2b2d31");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`setup_${id}`)
        .setLabel("Setup Room")
        .setStyle(ButtonStyle.Secondary)
    );

    const msg = await message.channel.send({
      embeds: [embed],
      components: [row]
    });

    matches[id].messageId = msg.id;
  }

  /* ================= PROFILE ================= */

  if (args[0] === "!p") {
    const user = message.mentions.users.first() || message.author;

    ensurePlayer(user.id);
    const d = players[user.id];

    const embed = new EmbedBuilder()
      .setTitle(`${user.username} Profile`)
      .addFields(
        { name: "Points", value: `${d.points}`, inline: true },
        { name: "Wins", value: `${d.wins}`, inline: true },
        { name: "Losses", value: `${d.losses}`, inline: true },
        { name: "MVPs", value: `${d.mvps}`, inline: true },
        { name: "Matches", value: `${d.matches}`, inline: true }
      );

    return message.channel.send({ embeds: [embed] });
  }

  /* ================= LEADERBOARD ================= */

  if (args[0] === "!lb") {
    const lb = getLeaderboard()
      .map((x, i) => `#${i + 1} <@${x[0]}> - ${x[1].points}`)
      .join("\n");

    return message.channel.send("🏆 Leaderboard\n" + lb);
  }

  /* ================= STAFF COMMANDS ================= */

  if (args[0] === "!w" || args[0] === "!l") {
    if (!message.member.roles.cache.has(STAFF_ROLE)) return;

    const target =
      message.mentions.users.first() ||
      await client.users.fetch(args[1]).catch(() => null);

    if (!target) return message.reply("User not found.");

    ensurePlayer(target.id);

    if (args[0] === "!w") {
      addPoints(target.id, 80);
      players[target.id].wins += 1;
    }

    if (args[0] === "!l") {
      players[target.id].points -= 30;
      players[target.id].losses += 1;
    }

    saveDB();

    return message.channel.send(
      `${args[0] === "!w" ? "🏆" : "❌"} ${target} points updated`
    );
  }
});

/* ================= INTERACTIONS ================= */

client.on(Events.InteractionCreate, async interaction => {

  /* ================= SETUP ROOM BUTTON ================= */

  if (interaction.isButton()) {
    const [action, id] = interaction.customId.split("_");
    const m = matches[id];
    if (!m) return;

    if (action === "setup") {
      const modal = new ModalBuilder()
        .setCustomId(`room_${id}`)
        .setTitle("Setup Match");

      const roomInput = new TextInputBuilder()
        .setCustomId("room")
        .setLabel("Room ID")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const passInput = new TextInputBuilder()
        .setCustomId("pass")
        .setLabel("Password")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const keyInput = new TextInputBuilder()
        .setCustomId("key")
        .setLabel("Private Key")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(roomInput),
        new ActionRowBuilder().addComponents(passInput),
        new ActionRowBuilder().addComponents(keyInput)
      );

      return interaction.showModal(modal);
    }
  }

  /* ================= ROOM SUBMIT ================= */

  if (interaction.isModalSubmit() && interaction.customId.startsWith("room_")) {
    const id = interaction.customId.split("_")[1];
    const m = matches[id];
    if (!m) return;

    const room = interaction.fields.getTextInputValue("room");
    const pass = interaction.fields.getTextInputValue("pass");
    const key = interaction.fields.getTextInputValue("key");

    if (!key || key.length < 3) {
      return interaction.reply({
        content: "❌ Private Key required (min 3 chars)",
        flags: 64
      });
    }

    m.roomId = room;
    m.password = pass;
    m.privateKey = key;

    await updateMatchPanel(interaction.channel, id);

    return interaction.reply({
      content: "✅ Room setup saved",
      flags: 64
    });
  }

  /* ================= JOIN BUTTON ================= */

  if (interaction.isButton()) {
    const parts = interaction.customId.split("_");
    const action = parts[0];
    const id = parts[1];

    const m = matches[id];
    if (!m) return;

    const member = await interaction.guild.members
      .fetch(interaction.user.id)
      .catch(() => null);

    if (await isPlayerBlockedFromMatch(member)) {
      return interaction.reply({
        content: "❌ Cannot join while in blocked voice channel",
        flags: 64
      });
    }

    if (action === "join1" || action === "join2") {
      const modal = new ModalBuilder()
        .setCustomId(`join_${action}_${id}`)
        .setTitle("Enter Private Key");

      const keyInput = new TextInputBuilder()
        .setCustomId("key")
        .setLabel("Private Key")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(keyInput)
      );

      return interaction.showModal(modal);
    }
  }

  /* ================= JOIN MODAL ================= */

  if (interaction.isModalSubmit() && interaction.customId.startsWith("join_")) {
    const [, action, id] = interaction.customId.split("_");
    const m = matches[id];
    if (!m) return;

    const enteredKey = interaction.fields.getTextInputValue("key");

    if (enteredKey !== m.privateKey) {
      return interaction.reply({
        content: "❌ Wrong Private Key",
        flags: 64
      });
    }

    const userId = interaction.user.id;

    if (action === "join1") {
      if (m.team1.length >= 4)
        return interaction.reply({ content: "Team 1 is full", flags: 64 });

      m.team2 = m.team2.filter(x => x !== userId);
      if (!m.team1.includes(userId)) m.team1.push(userId);
    }

    if (action === "join2") {
      if (m.team2.length >= 4)
        return interaction.reply({ content: "Team 2 is full", flags: 64 });

      m.team1 = m.team1.filter(x => x !== userId);
      if (!m.team2.includes(userId)) m.team2.push(userId);
    }

    await updateMatchPanel(interaction.channel, id);

    await interaction.reply({
      content: "✅ Joined team",
      flags: 64
    });

    /* AUTO START */
    if (m.team1.length === 4 && m.team2.length === 4) {
      await checkStart(m, interaction);
    }
  }  /* ================= LEAVE / CANCEL ================= */

  if (interaction.isButton()) {
    const parts = interaction.customId.split("_");
    const action = parts[0];
    const id = parts[1];

    const m = matches[id];
    if (!m) return;

    const userId = interaction.user.id;

    /* ================= LEAVE ================= */

    if (action === "leave") {
      m.team1 = m.team1.filter(x => x !== userId);
      m.team2 = m.team2.filter(x => x !== userId);

      await updateMatchPanel(interaction.channel, id);

      return interaction.reply({
        content: "❌ Left match",
        flags: 64
      });
    }

    /* ================= CANCEL ================= */

    if (action === "cancel") {
      if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
        return interaction.reply({
          content: "Staff only",
          flags: 64
        });
      }

      delete matches[id];

      return interaction.reply({
        content: "❌ Match cancelled"
      });
    }
  }

  /* ================= MATCH MENU ================= */

  if (interaction.isStringSelectMenu()) {
    if (!interaction.customId.startsWith("matchmenu_")) return;

    const id = interaction.customId.split("_")[1];
    const m = matches[id];
    if (!m) return;

    const choice = interaction.values[0];

    /* ================= CALL STAFF ================= */

    if (choice === "staff") {
      return interaction.reply({
        content: `📢 Staff requested by ${interaction.user}`
      });
    }

    /* ================= MVP WIN ================= */

    if (choice === "mvpwin") {
      voteSessions[id] = {
        type: "win",
        votes: {},
        voted: []
      };

      const buttons = m.team1.map(p =>
        new ButtonBuilder()
          .setCustomId(`vote_${id}_${p}`)
          .setLabel("Player")
          .setStyle(ButtonStyle.Success)
      );

      return interaction.reply({
        content: "Vote MVP Winner",
        components: [new ActionRowBuilder().addComponents(buttons)]
      });
    }

    /* ================= MVP LOSE ================= */

    if (choice === "mvplose") {
      voteSessions[id] = {
        type: "lose",
        votes: {},
        voted: []
      };

      const buttons = m.team2.map(p =>
        new ButtonBuilder()
          .setCustomId(`vote_${id}_${p}`)
          .setLabel("Player")
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({
        content: "Vote MVP Loser",
        components: [new ActionRowBuilder().addComponents(buttons)]
      });
    }
  }

  /* ================= VOTE SYSTEM ================= */

  if (interaction.isButton()) {
    const parts = interaction.customId.split("_");

    if (parts[0] !== "vote") return;

    const id = parts[1];
    const target = parts[2];

    const m = matches[id];
    const session = voteSessions[id];

    if (!m || !session) return;

    const voter = interaction.user.id;

    if (session.voted.includes(voter)) {
      return interaction.reply({
        content: "Already voted",
        flags: 64
      });
    }

    session.voted.push(voter);
    session.votes[target] = (session.votes[target] || 0) + 1;

    await interaction.reply({
      content: "Vote counted",
      flags: 64
    });

    /* FINISH VOTING */

    if (session.voted.length >= 2) {
      const winner = Object.entries(session.votes)
        .sort((a, b) => b[1] - a[1])[0][0];

      ensurePlayer(winner);

      if (session.type === "win") {
        addPoints(winner, 80);
        players[winner].wins += 1;
        players[winner].mvps += 1;
      }

      if (session.type === "lose") {
        addPoints(winner, 30);
        players[winner].losses += 1;
      }

      saveDB();

      delete voteSessions[id];

      interaction.channel.send(`👑 MVP: <@${winner}>`);
    }
  }
});

/* ================= AUTO MATCH START ================= */

async function checkStart(m, interaction) {
  if (!m || m.active) return;

  if (m.team1.length === 4 && m.team2.length === 4) {
    m.active = true;

    const guild = interaction.guild;

    const voice = await guild.channels.create({
      name: `MATCH-${m.id.slice(-4)}`,
      type: ChannelType.GuildVoice,
permissionOverwrites: [
  {
    id: guild.roles.everyone,
    deny: [PermissionsBitField.Flags.ViewChannel]
  },
  {
    id: "1507122833866625085",
    allow: [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.Connect,
      PermissionsBitField.Flags.Speak
    ]
  }
]
    });

    m.voiceChannel = voice.id;

    const all = [...m.team1, ...m.team2];

    for (const id of all) {
      ensurePlayer(id);
      players[id].matches += 1;

      const member = await guild.members.fetch(id).catch(() => null);

      if (member?.voice?.channel) {
        await member.voice.setChannel(voice).catch(() => {});
      }
    }

    saveDB();

    const embed = new EmbedBuilder()
      .setTitle("🎮 MATCH INFO")
      .setColor("#2b2d31")
      .addFields(
        { name: "Room ID", value: m.roomId || "None", inline: true },
        { name: "Password", value: m.password || "None", inline: true }
      );

    for (const id of all) {
      const user = await client.users.fetch(id).catch(() => null);
      if (user) {
        await user.send({ embeds: [embed] }).catch(() => {});
      }
    }

    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`matchmenu_${m.id}`)
        .setPlaceholder("Match Menu")
        .addOptions([
          {
            label: "Call Staff",
            value: "staff",
            description: "Request staff help"
          },
          {
            label: "Vote MVP Winner",
            value: "mvpwin",
            description: "Vote winner MVP"
          },
          {
            label: "Vote MVP Loser",
            value: "mvplose",
            description: "Vote loser MVP"
          }
        ])
    );

    await interaction.channel.send({
      content: `🎮 MATCH STARTED: <@${all.join(">, <@")}>`,
      components: [menu]
    });
  }
}

/* ================= VOICE CLEANUP ================= */

client.on("voiceStateUpdate", async (oldState) => {
  const channel = oldState.channel;
  if (!channel) return;

  if (channel.name.startsWith("MATCH-") && channel.members.size === 0) {
    await channel.delete().catch(() => {});
  }
});

client.login(process.env.TOKEN);