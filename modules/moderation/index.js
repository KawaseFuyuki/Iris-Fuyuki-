import { dbq, getGuildConfig, setGuildConfig } from '../../database.js';
import { makeEmbed, errorEmbed, successEmbed, isMod, isAdmin, parseTime, formatDuration } from '../../utils.js';

export const prefixCommands = {
  'antilink': cmdAntilink,
  'antinuke': cmdAntinuke,
  'mute': cmdMute,
  'unmute': cmdUnmute,
  'ban': cmdBan,
  'unban': cmdUnban,
  'warn': cmdWarn,
  'warnings': cmdWarnings,
  'clearwarns': cmdClearWarns,
  'purge': cmdPurge,
  'lock': cmdLock,
  'unlock': cmdUnlock,
  'blacklist': cmdBlacklist,
  'unblacklist': cmdUnblacklist,
  'blacklistlist': cmdBlacklistList,
  'disable': cmdDisable,
  'enable': cmdEnable,
  'logs': cmdLogs,
  'snipe': cmdSnipe,
};

async function cmdAntilink(message, args, config) {
  if (!isAdmin(message.member)) return message.reply({ embeds: [errorEmbed('You need Administrator permission.')] });
  const sub = args[0]?.toLowerCase();
  if (sub === 'enable') {
    setGuildConfig(message.guild.id, { antilink_enabled: 1 });
    return message.reply({ embeds: [successEmbed('AntiLink enabled. GIF links are allowed. All other links will be deleted.')] });
  }
  if (sub === 'disable') {
    setGuildConfig(message.guild.id, { antilink_enabled: 0 });
    return message.reply({ embeds: [successEmbed('AntiLink disabled.')] });
  }
  return message.reply({ embeds: [makeEmbed({ title: '🔗 AntiLink', description: 'Usage: `&antilink enable` or `&antilink disable`' })] });
}

async function cmdAntinuke(message, args, config) {
  if (!isAdmin(message.member)) return message.reply({ embeds: [errorEmbed('You need Administrator permission.')] });
  const sub = args[0]?.toLowerCase();
  if (sub === 'enable') {
    setGuildConfig(message.guild.id, { antinuke_enabled: 1 });
    return message.reply({ embeds: [successEmbed('AntiNuke enabled. Mass bans/kicks/channel deletions will be prevented.')] });
  }
  if (sub === 'disable') {
    setGuildConfig(message.guild.id, { antinuke_enabled: 0 });
    return message.reply({ embeds: [successEmbed('AntiNuke disabled.')] });
  }
  return message.reply({ embeds: [makeEmbed({ title: '🛡️ AntiNuke', description: 'Usage: `&antinuke enable` or `&antinuke disable`' })] });
}

async function cmdMute(message, args, config) {
  if (!isMod(message.member)) return message.reply({ embeds: [errorEmbed('Missing permissions.')] });
  const target = message.mentions.members.first();
  if (!target) return message.reply({ embeds: [errorEmbed('Mention a user to mute.')] });
  const duration = args[1];
  const reason = args.slice(2).join(' ') || 'No reason provided';
  const ms = duration ? parseTime(duration) : null;
  try {
    await target.timeout(ms || 600000, reason);
    await sendLog(message.guild, config, makeEmbed({
      title: '🔇 Member Muted',
      fields: [
        { name: 'User', value: `${target} (${target.user.tag})`, inline: true },
        { name: 'Moderator', value: `${message.author}`, inline: true },
        { name: 'Duration', value: ms ? formatDuration(ms) : '10m (default)', inline: true },
        { name: 'Reason', value: reason }
      ],
      timestamp: true
    }));
    return message.reply({ embeds: [successEmbed(`Muted ${target.user.tag}${ms ? ` for ${formatDuration(ms)}` : ''}.`)] });
  } catch {
    return message.reply({ embeds: [errorEmbed('Could not mute. Check permissions.')] });
  }
}

async function cmdUnmute(message, args, config) {
  if (!isMod(message.member)) return message.reply({ embeds: [errorEmbed('Missing permissions.')] });
  const target = message.mentions.members.first();
  if (!target) return message.reply({ embeds: [errorEmbed('Mention a user to unmute.')] });
  try {
    await target.timeout(null);
    return message.reply({ embeds: [successEmbed(`Unmuted ${target.user.tag}.`)] });
  } catch {
    return message.reply({ embeds: [errorEmbed('Could not unmute.')] });
  }
}

async function cmdBan(message, args, config) {
  if (!message.member.permissions.has('BanMembers')) return message.reply({ embeds: [errorEmbed('Missing Ban Members permission.')] });
  const target = message.mentions.members.first() || message.mentions.users.first();
  if (!target) return message.reply({ embeds: [errorEmbed('Mention a user to ban.')] });
  const reason = args.slice(1).join(' ') || 'No reason provided';
  try {
    await message.guild.bans.create(target.id || target, { reason });
    await sendLog(message.guild, config, makeEmbed({
      title: '🔨 Member Banned',
      fields: [
        { name: 'User', value: `${target}`, inline: true },
        { name: 'Moderator', value: `${message.author}`, inline: true },
        { name: 'Reason', value: reason }
      ],
      timestamp: true
    }));
    return message.reply({ embeds: [successEmbed(`Banned ${target.user?.tag || target}.`)] });
  } catch {
    return message.reply({ embeds: [errorEmbed('Could not ban.')] });
  }
}

async function cmdUnban(message, args, config) {
  if (!message.member.permissions.has('BanMembers')) return message.reply({ embeds: [errorEmbed('Missing Ban Members permission.')] });
  const userId = args[0];
  if (!userId) return message.reply({ embeds: [errorEmbed('Provide a user ID to unban.')] });
  try {
    await message.guild.bans.remove(userId);
    return message.reply({ embeds: [successEmbed(`Unbanned user \`${userId}\`.`)] });
  } catch {
    return message.reply({ embeds: [errorEmbed('Could not unban. Is the ID correct?')] });
  }
}

async function cmdWarn(message, args, config) {
  if (!isMod(message.member)) return message.reply({ embeds: [errorEmbed('Missing permissions.')] });
  const target = message.mentions.members.first();
  if (!target) return message.reply({ embeds: [errorEmbed('Mention a user to warn.')] });
  const reason = args.slice(1).join(' ') || 'No reason provided';
  dbq.prepare('INSERT INTO warnings (guild_id, user_id, moderator_id, reason, timestamp) VALUES (?,?,?,?,?)').run(message.guild.id, target.id, message.author.id, reason, Date.now());
  const countRow = dbq.prepare('SELECT COUNT(*) as c FROM warnings WHERE guild_id = ? AND user_id = ?').get(message.guild.id, target.id);
  const count = countRow?.c || 1;
  await sendLog(message.guild, config, makeEmbed({
    title: '⚠️ Member Warned',
    fields: [
      { name: 'User', value: `${target} (${target.user.tag})`, inline: true },
      { name: 'Moderator', value: `${message.author}`, inline: true },
      { name: 'Total Warnings', value: `${count}`, inline: true },
      { name: 'Reason', value: reason }
    ],
    timestamp: true
  }));
  return message.reply({ embeds: [makeEmbed({ title: '⚠️ Warning Issued', description: `${target.user.tag} has been warned. Total warnings: **${count}**\nReason: ${reason}` })] });
}

async function cmdWarnings(message, args, config) {
  const target = message.mentions.members.first();
  if (!target) return message.reply({ embeds: [errorEmbed('Mention a user.')] });
  const warns = dbq.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY timestamp DESC').all(message.guild.id, target.id);
  if (!warns.length) return message.reply({ embeds: [makeEmbed({ title: '📋 Warnings', description: `${target.user.tag} has no warnings.` })] });
  const desc = warns.map((w, i) => `**${i + 1}.** ${w.reason} — <t:${Math.floor(w.timestamp / 1000)}:R> by <@${w.moderator_id}>`).join('\n');
  return message.reply({ embeds: [makeEmbed({ title: `⚠️ Warnings for ${target.user.tag}`, description: desc })] });
}

async function cmdClearWarns(message, args, config) {
  if (!isMod(message.member)) return message.reply({ embeds: [errorEmbed('Missing permissions.')] });
  const target = message.mentions.members.first();
  if (!target) return message.reply({ embeds: [errorEmbed('Mention a user.')] });
  dbq.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?').run(message.guild.id, target.id);
  return message.reply({ embeds: [successEmbed(`Cleared all warnings for ${target.user.tag}.`)] });
}

async function cmdPurge(message, args, config) {
  if (!isMod(message.member)) return message.reply({ embeds: [errorEmbed('Missing permissions.')] });
  const amount = parseInt(args[0]);
  if (isNaN(amount) || amount < 1 || amount > 150) return message.reply({ embeds: [errorEmbed('Provide a number between 1 and 150.')] });
  try {
    await message.delete().catch(() => {});
    const deleted = await message.channel.bulkDelete(amount, true);
    const notice = await message.channel.send({ embeds: [successEmbed(`Deleted ${deleted.size} messages.`)] });
    setTimeout(() => notice.delete().catch(() => {}), 3000);
  } catch {
    return message.reply({ embeds: [errorEmbed('Could not purge. Messages may be too old (14+ days).')] });
  }
}

async function cmdLock(message, args, config) {
  if (!isMod(message.member)) return message.reply({ embeds: [errorEmbed('Missing permissions.')] });
  try {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
    return message.reply({ embeds: [makeEmbed({ title: '🔒 Channel Locked', description: 'This channel has been locked.' })] });
  } catch {
    return message.reply({ embeds: [errorEmbed('Could not lock channel.')] });
  }
}

async function cmdUnlock(message, args, config) {
  if (!isMod(message.member)) return message.reply({ embeds: [errorEmbed('Missing permissions.')] });
  try {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
    return message.reply({ embeds: [makeEmbed({ title: '🔓 Channel Unlocked', description: 'This channel has been unlocked.' })] });
  } catch {
    return message.reply({ embeds: [errorEmbed('Could not unlock channel.')] });
  }
}

async function cmdBlacklist(message, args, config) {
  if (!isAdmin(message.member)) return message.reply({ embeds: [errorEmbed('Administrator only.')] });
  const word = args[0]?.toLowerCase();
  if (!word) return message.reply({ embeds: [errorEmbed('Provide a word to blacklist.')] });
  const words = Array.isArray(config.blacklist_words) ? config.blacklist_words : [];
  if (words.includes(word)) return message.reply({ embeds: [errorEmbed('Word already blacklisted.')] });
  words.push(word);
  setGuildConfig(message.guild.id, { blacklist_words: words });
  return message.reply({ embeds: [successEmbed(`Added \`${word}\` to blacklist.`)] });
}

async function cmdUnblacklist(message, args, config) {
  if (!isAdmin(message.member)) return message.reply({ embeds: [errorEmbed('Administrator only.')] });
  const word = args[0]?.toLowerCase();
  if (!word) return message.reply({ embeds: [errorEmbed('Provide a word to remove.')] });
  const words = (Array.isArray(config.blacklist_words) ? config.blacklist_words : []).filter(w => w !== word);
  setGuildConfig(message.guild.id, { blacklist_words: words });
  return message.reply({ embeds: [successEmbed(`Removed \`${word}\` from blacklist.`)] });
}

async function cmdBlacklistList(message, args, config) {
  const words = Array.isArray(config.blacklist_words) ? config.blacklist_words : [];
  if (!words.length) return message.reply({ embeds: [makeEmbed({ title: '📋 Blacklisted Words', description: 'No words blacklisted.' })] });
  return message.reply({ embeds: [makeEmbed({ title: '📋 Blacklisted Words', description: words.map(w => `\`${w}\``).join(', ') })] });
}

async function cmdDisable(message, args, config) {
  if (!isAdmin(message.member)) return message.reply({ embeds: [errorEmbed('Administrator only.')] });
  const cmd = args[0]?.toLowerCase();
  const channel = message.mentions.channels.first() || message.channel;
  if (!cmd) return message.reply({ embeds: [errorEmbed('Provide a command name.')] });
  const disabled = Array.isArray(config.disabled_commands) ? config.disabled_commands : [];
  const key = `${cmd}:${channel.id}`;
  if (disabled.includes(key)) return message.reply({ embeds: [errorEmbed('Already disabled in that channel.')] });
  disabled.push(key);
  setGuildConfig(message.guild.id, { disabled_commands: disabled });
  return message.reply({ embeds: [successEmbed(`Disabled \`${cmd}\` in ${channel}.`)] });
}

async function cmdEnable(message, args, config) {
  if (!isAdmin(message.member)) return message.reply({ embeds: [errorEmbed('Administrator only.')] });
  const cmd = args[0]?.toLowerCase();
  const channel = message.mentions.channels.first() || message.channel;
  if (!cmd) return message.reply({ embeds: [errorEmbed('Provide a command name.')] });
  const disabled = (Array.isArray(config.disabled_commands) ? config.disabled_commands : []).filter(d => d !== `${cmd}:${channel.id}`);
  setGuildConfig(message.guild.id, { disabled_commands: disabled });
  return message.reply({ embeds: [successEmbed(`Enabled \`${cmd}\` in ${channel}.`)] });
}

async function cmdLogs(message, args, config) {
  if (!isAdmin(message.member)) return message.reply({ embeds: [errorEmbed('Administrator only.')] });
  const channel = message.mentions.channels.first();
  if (!channel) return message.reply({ embeds: [errorEmbed('Mention a channel for logs.')] });
  setGuildConfig(message.guild.id, { log_channel: channel.id });
  return message.reply({ embeds: [successEmbed(`Logs will be sent to ${channel}.`)] });
}

async function cmdSnipe(message, args, config) {
  const rows = dbq.prepare('SELECT * FROM deleted_messages WHERE guild_id = ? AND channel_id = ? ORDER BY timestamp DESC LIMIT 1').all(message.guild.id, message.channel.id);
  if (!rows.length) return message.reply({ embeds: [makeEmbed({ title: '👻 Snipe', description: 'No recently deleted messages in this channel.' })] });
  const row = rows[0];
  return message.reply({ embeds: [makeEmbed({
    title: '👻 Sniped Message',
    description: row.content || '*[No text content]*',
    fields: [
      { name: 'Author', value: `<@${row.author_id}> (${row.author_tag})`, inline: true },
      { name: 'Deleted', value: `<t:${Math.floor(row.timestamp / 1000)}:R>`, inline: true }
    ]
  })] });
}

export async function sendLog(guild, config, embed) {
  const logChannelId = config?.log_channel;
  if (!logChannelId) return;
  try {
    const channel = await guild.channels.fetch(logChannelId);
    if (channel) await channel.send({ embeds: [embed] });
  } catch {}
}

export async function handleMessageForMod(message, config) {
  if (!message.guild || message.author.bot) return;
  const content = message.content.toLowerCase();
  const words = Array.isArray(config.blacklist_words) ? config.blacklist_words : [];
  if (words.some(w => content.includes(w))) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send({ embeds: [errorEmbed(`${message.author}, your message contained a blacklisted word.`)] });
    setTimeout(() => warn.delete().catch(() => {}), 4000);
    return true;
  }
  if (config.antilink_enabled) {
    const urlRegex = /https?:\/\/[^\s]+|discord\.gg\/[^\s]+/gi;
    const gifRegex = /https?:\/\/(tenor\.com|giphy\.com|media\.tenor\.com)[^\s]*/gi;
    const matches = content.match(urlRegex);
    if (matches) {
      const nonGif = matches.filter(m => !m.match(/https?:\/\/(tenor\.com|giphy\.com|media\.tenor\.com)/i) && !m.endsWith('.gif'));
      if (nonGif.length > 0) {
        await message.delete().catch(() => {});
        const warn = await message.channel.send({ embeds: [errorEmbed(`${message.author}, links are not allowed here! (GIFs are okay)`)] });
        setTimeout(() => warn.delete().catch(() => {}), 4000);
        return true;
      }
    }
  }
  return false;
}

export async function handleMemberJoin(member, config) {
  await sendLog(member.guild, config, makeEmbed({
    title: '📥 Member Joined',
    fields: [
      { name: 'User', value: `${member} (${member.user.tag})`, inline: true },
      { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
    ],
    thumbnail: member.user.displayAvatarURL(),
    timestamp: true
  }));
}

export async function handleMemberLeave(member, config) {
  await sendLog(member.guild, config, makeEmbed({
    title: '📤 Member Left',
    fields: [
      { name: 'User', value: `${member.user.tag}`, inline: true },
      { name: 'Joined', value: member.joinedAt ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true }
    ],
    timestamp: true
  }));
}

export async function handleMessageDelete(message, config) {
  if (!message.author || message.author.bot) return;
  if (message.content) {
    dbq.prepare('INSERT INTO deleted_messages (guild_id, channel_id, author_id, author_tag, content, timestamp) VALUES (?,?,?,?,?,?)').run(
      message.guild.id, message.channel.id, message.author.id, message.author.tag, message.content, Date.now()
    );
    const rows = dbq.prepare('SELECT id FROM deleted_messages WHERE guild_id = ? AND channel_id = ? ORDER BY timestamp DESC').all(message.guild.id, message.channel.id);
    if (rows.length > 10) {
      const toDelete = rows.slice(10).map(r => r.id);
      for (const id of toDelete) dbq.prepare('DELETE FROM deleted_messages WHERE id = ?').run(id);
    }
  }
  await sendLog(message.guild, config, makeEmbed({
    title: '🗑️ Message Deleted',
    fields: [
      { name: 'Author', value: `${message.author} (${message.author.tag})`, inline: true },
      { name: 'Channel', value: `${message.channel}`, inline: true },
      { name: 'Content', value: message.content || '*[No text]*' }
    ],
    timestamp: true
  }));
}

export async function handleMessageUpdate(oldMsg, newMsg, config) {
  if (!oldMsg.author || oldMsg.author.bot) return;
  if (oldMsg.content === newMsg.content) return;
  await sendLog(oldMsg.guild, config, makeEmbed({
    title: '✏️ Message Edited',
    fields: [
      { name: 'Author', value: `${oldMsg.author} (${oldMsg.author.tag})`, inline: true },
      { name: 'Channel', value: `${oldMsg.channel}`, inline: true },
      { name: 'Before', value: oldMsg.content || '*[empty]*' },
      { name: 'After', value: newMsg.content || '*[empty]*' }
    ],
    timestamp: true
  }));
}

export async function handleGuildMemberUpdate(oldMember, newMember, config) {
  const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
  if (addedRoles.size) {
    await sendLog(newMember.guild, config, makeEmbed({
      title: '🎭 Role Added',
      fields: [
        { name: 'User', value: `${newMember} (${newMember.user.tag})`, inline: true },
        { name: 'Roles Added', value: addedRoles.map(r => `${r}`).join(', ') }
      ],
      timestamp: true
    }));
  }
  if (removedRoles.size) {
    await sendLog(newMember.guild, config, makeEmbed({
      title: '🎭 Role Removed',
      fields: [
        { name: 'User', value: `${newMember} (${newMember.user.tag})`, inline: true },
        { name: 'Roles Removed', value: removedRoles.map(r => `${r}`).join(', ') }
      ],
      timestamp: true
    }));
  }
  if (oldMember.nickname !== newMember.nickname) {
    await sendLog(newMember.guild, config, makeEmbed({
      title: '📝 Nickname Changed',
      fields: [
        { name: 'User', value: `${newMember} (${newMember.user.tag})`, inline: true },
        { name: 'Before', value: oldMember.nickname || '*[None]*', inline: true },
        { name: 'After', value: newMember.nickname || '*[None]*', inline: true }
      ],
      timestamp: true
    }));
  }
}

export async function handleUserUpdate(oldUser, newUser, client) {
  if (oldUser.avatar !== newUser.avatar) {
    for (const [, guild] of client.guilds.cache) {
      const config = getGuildConfig(guild.id);
      if (!config.log_channel) continue;
      const member = guild.members.cache.get(newUser.id);
      if (!member) continue;
      await sendLog(guild, config, makeEmbed({
        title: '🖼️ Avatar Changed',
        fields: [{ name: 'User', value: `${newUser.tag}`, inline: true }],
        thumbnail: newUser.displayAvatarURL(),
        timestamp: true
      }));
    }
  }
}
// ================= BOT LOCK COMMANDS =================
// &not = Lock all bots, &allow = Unlock all bots

const { PermissionFlagsBits } = require('discord.js');

exports.not = {
    name: 'not',
    description: 'Lock ALL BOTS in this channel',
    async execute(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply("❌ You need `Manage Channels` permission to use this command.");
        }

        const channel = message.channel;
        // Filter all bots except your own bot
        const bots = message.guild.members.cache.filter(member => member.user.bot && member.id !== message.client.user.id);

        if (bots.size === 0) return message.reply("❌ No other bots found in this server.");

        for (const [id, bot] of bots) {
            await channel.permissionOverwrites.edit(bot, { SendMessages: false });
        }

        await message.reply(`🔒 Locked **${bots.size} bots** in ${channel}. No bot can send messages here now.`);
    },
}

exports.allow = {
    name: 'allow',
    description: 'Unlock ALL BOTS in this channel',
    async execute(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply("❌ You need `Manage Channels` permission to use this command.");
        }

        const channel = message.channel;
        const bots = message.guild.members.cache.filter(member => member.user.bot && member.id !== message.client.user.id);

        if (bots.size === 0) return message.reply("❌ No other bots found in this server.");

        for (const [id, bot] of bots) {
            await channel.permissionOverwrites.edit(bot, { SendMessages: true });
        }

        await message.reply(`🔓 Unlocked **${bots.size} bots** in ${channel}. All bots can send messages here now.`);
    },
}
// ================= END BOT LOCK =================
