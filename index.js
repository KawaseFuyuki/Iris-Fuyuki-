import {
  Client, GatewayIntentBits, Partials, REST, Routes
} from 'discord.js';
import express from 'express';
import { getGuildConfig } from './database.js';
import mongoose from 'mongoose';
import { handleHelp } from './modules/help/index.js';
import * as RR from './modules/reactionroles/index.js';
import * as MOD from './modules/moderation/index.js';
import * as INFO from './modules/info/index.js';
import * as SETUP from './modules/setup/index.js';

// ─── Keep-Alive Express Server ────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`✅ Iris Fuyuki is online! Uptime: ${Math.floor(process.uptime())}s`);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', bot: client.user?.tag || 'connecting...', uptime: Math.floor(process.uptime()) });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Keep-alive server running on port ${PORT}`);
});
// --- MongoDB Connect ---
mongoose.connect(process.env.MONGO_URL).then(() => {
    console.log('✅ MongoDB Connected');
}).catch(err => {
    console.log('❌ MongoDB Error:', err);
});
// -----------------------

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) throw new Error('DISCORD_BOT_TOKEN is not set!');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel, Partials.GuildMember, Partials.User]
});

const inviteCache = new Map();

// ─── Ready ────────────────────────────────────────────────────────────────────
client.once('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Status: Watching Anime
  client.user.setPresence({ activities: [{ name: 'Anime', type: 3 }], status: 'online' });

  // Register slash commands globally
  const allSlash = [
    ...RR.slashCommands,
    ...INFO.slashCommands,
    ...SETUP.slashCommands,
  ];
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: allSlash.map(c => c.toJSON()) });
    console.log(`✅ Registered ${allSlash.length} slash commands globally.`);
  } catch (e) {
    console.error('Slash command registration failed:', e.message);
  }

  // Cache invites for all guilds
  for (const [, guild] of client.guilds.cache) {
    try {
      const invites = await guild.invites.fetch();
      inviteCache.set(guild.id, new Map(invites.map(inv => [inv.code, { uses: inv.uses, inviterId: inv.inviter?.id }])));
    } catch {}
  }
  console.log('✅ Invite cache populated.');

  // Background tasks
  setInterval(() => RR.checkTempRoles(client), 30000);
  setInterval(() => RR.checkTimers(client), 15000);
  setInterval(() => INFO.checkGiveaways(client), 30000);
  console.log('✅ Background tasks started. Bot is ready!');
});

// ─── New Guild ────────────────────────────────────────────────────────────────
client.on('guildCreate', async guild => {
  try {
    const invites = await guild.invites.fetch();
    inviteCache.set(guild.id, new Map(invites.map(inv => [inv.code, { uses: inv.uses, inviterId: inv.inviter?.id }])));
  } catch {}
});

// ─── Prefix Messages ──────────────────────────────────────────────────────────
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;

  const config = getGuildConfig(message.guild.id);
  const prefix = config.prefix || '&';

  // Moderation filters (antilink, blacklist) — runs for ALL messages
  const blocked = await MOD.handleMessageForMod(message, config);
  if (blocked) return;

  // Trigger system
  await INFO.handleTriggers(message);

  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // Check if command is disabled in this channel
  const disabled = Array.isArray(config.disabled_commands) ? config.disabled_commands : [];
  if (disabled.includes(`${cmd}:${message.channel.id}`)) {
    return message.reply({ content: `The \`${cmd}\` command is disabled in this channel.` });
  }

  // Help
  if (cmd === 'help') return handleHelp(message, args, config, client);

  // Moderation
  if (MOD.prefixCommands[cmd]) return MOD.prefixCommands[cmd](message, args, config);

  // Info & Giveaways
  if (INFO.prefixCommands[cmd]) return INFO.prefixCommands[cmd](message, args, config, client);
});

// ─── Slash Commands ───────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  // Buttons
  if (interaction.isButton()) {
    if (
      interaction.customId === 'ticket_create' ||
      interaction.customId === 'ticket_close' ||
      interaction.customId.startsWith('ticket_extra_')
    ) {
      return SETUP.handleTicketButton(interaction);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;

  // Reaction role slash commands
  const rrNames = RR.slashCommands.map(c => c.name);
  if (rrNames.includes(cmd)) return RR.handleSlash(interaction);

  // Setup slash commands
  const setupNames = SETUP.slashCommands.map(c => c.name);
  if (setupNames.includes(cmd)) return SETUP.handleSlash(interaction);

  // Info slash commands (giveaway)
  if (cmd === 'giveaway') return INFO.handleGiveawaySlash(interaction);
});

// ─── Reaction Roles ───────────────────────────────────────────────────────────
client.on('messageReactionAdd', (reaction, user) => RR.handleReactionAdd(reaction, user));
client.on('messageReactionRemove', (reaction, user) => RR.handleReactionRemove(reaction, user));

// ─── Member Events ────────────────────────────────────────────────────────────
client.on('guildMemberAdd', async member => {
  const config = getGuildConfig(member.guild.id);
  await SETUP.handleWelcome(member, config);
  await MOD.handleMemberJoin(member, config);
  await INFO.handleInviteJoin(member, inviteCache);
});

client.on('guildMemberRemove', async member => {
  const config = getGuildConfig(member.guild.id);
  await MOD.handleMemberLeave(member, config);
  await INFO.handleInviteLeave(member);
});

// ─── Message Events ───────────────────────────────────────────────────────────
client.on('messageDelete', async message => {
  if (!message.guild || message.author?.bot) return;
  const config = getGuildConfig(message.guild.id);
  await MOD.handleMessageDelete(message, config);
});

client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!oldMsg.guild || oldMsg.author?.bot) return;
  const config = getGuildConfig(oldMsg.guild.id);
  await MOD.handleMessageUpdate(oldMsg, newMsg, config);
});

// ─── Member Update (roles, nickname) ─────────────────────────────────────────
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const config = getGuildConfig(newMember.guild.id);
  await MOD.handleGuildMemberUpdate(oldMember, newMember, config);
});

// ─── User Update (avatar) ─────────────────────────────────────────────────────
client.on('userUpdate', async (oldUser, newUser) => {
  await MOD.handleUserUpdate(oldUser, newUser, client);
});

// ─── Invite Cache ─────────────────────────────────────────────────────────────
client.on('inviteCreate', invite => {
  if (!inviteCache.has(invite.guild.id)) inviteCache.set(invite.guild.id, new Map());
  inviteCache.get(invite.guild.id).set(invite.code, { uses: invite.uses, inviterId: invite.inviter?.id });
});
client.on('inviteDelete', invite => {
  inviteCache.get(invite.guild.id)?.delete(invite.code);
});

// ─── AntiNuke ─────────────────────────────────────────────────────────────────
const nukeTracker = new Map();
async function checkNuke(guildId, action) {
  const config = getGuildConfig(guildId);
  if (!config.antinuke_enabled) return;
  const key = `${guildId}:${action}`;
  const now = Date.now();
  const entry = nukeTracker.get(key) || { count: 0, first: now };
  if (now - entry.first > 10000) {
    nukeTracker.set(key, { count: 1, first: now });
    return;
  }
  entry.count++;
  nukeTracker.set(key, entry);
  if (entry.count >= 3) {
    try {
      const guild = client.guilds.cache.get(guildId);
      const logCh = config.log_channel ? await guild.channels.fetch(config.log_channel).catch(() => null) : null;
      if (logCh) logCh.send({ embeds: [{ title: '🛡️ AntiNuke Triggered', description: `Mass ${action} detected! Action: ${entry.count} in 10s`, color: 0xFF0000 }] });
    } catch {}
  }
}

client.on('channelDelete', ch => { if (ch.guild) checkNuke(ch.guild.id, 'channel_delete'); });
client.on('guildBanAdd', ban => checkNuke(ban.guild.id, 'ban'));

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(TOKEN).catch(e => {
  console.error('❌ Failed to login:', e.message);
  process.exit(1);
});
