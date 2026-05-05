import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { dbq, getGuildConfig, setGuildConfig } from '../../database.js';
import { makeEmbed, errorEmbed, successEmbed, isAdmin, parseTime, formatDuration } from '../../utils.js';

export const slashCommands = [
  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Giveaway commands')
    .addSubcommand(s => s.setName('start').setDescription('Start a giveaway')
      .addStringOption(o => o.setName('prize').setDescription('Prize').setRequired(true))
      .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 1h, 30m').setRequired(true))
      .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setRequired(false)))
    .addSubcommand(s => s.setName('end').setDescription('End a giveaway')
      .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true)))
    .addSubcommand(s => s.setName('reroll').setDescription('Reroll a giveaway')
      .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true))),
];

export const prefixCommands = {
  'av': cmdAvatar,
  'avatar': cmdAvatar,
  'si': cmdServerInfo,
  'serverinfo': cmdServerInfo,
  'ui': cmdUserInfo,
  'userinfo': cmdUserInfo,
  'mc': cmdMemberCount,
  'membercount': cmdMemberCount,
  'i': cmdInvites,
  'invites': cmdInvites,
  'ilb': cmdInviteLeaderboard,
  'inviteleaderboard': cmdInviteLeaderboard,
  'ireset': cmdInviteReset,
  'trigger': cmdTrigger,
  'gs': cmdGiveawayStart,
  'ge': cmdGiveawayEnd,
  'gr': cmdGiveawayReroll,
  'giveaway': cmdGiveawayMain,
  'ping': cmdPing,
  'stoptimer': cmdStopTimer,
};

async function cmdAvatar(message) {
  const target = message.mentions.users.first() || message.author;
  const url = target.displayAvatarURL({ size: 512, extension: 'png' });
  return message.reply({ embeds: [makeEmbed({ title: `🖼️ ${target.username}'s Avatar`, image: url })] });
}

async function cmdServerInfo(message) {
  const g = message.guild;
  await g.fetch();
  return message.reply({ embeds: [makeEmbed({
    title: `📊 ${g.name}`,
    thumbnail: g.iconURL({ size: 256 }),
    fields: [
      { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
      { name: 'Members', value: `${g.memberCount}`, inline: true },
      { name: 'Channels', value: `${g.channels.cache.size}`, inline: true },
      { name: 'Roles', value: `${g.roles.cache.size}`, inline: true },
      { name: 'Boosts', value: `${g.premiumSubscriptionCount || 0}`, inline: true },
      { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
    ]
  })] });
}

async function cmdUserInfo(message) {
  const target = message.mentions.members.first() || message.member;
  const u = target.user;
  return message.reply({ embeds: [makeEmbed({
    title: `👤 ${u.tag}`,
    thumbnail: u.displayAvatarURL({ size: 256 }),
    fields: [
      { name: 'ID', value: u.id, inline: true },
      { name: 'Nickname', value: target.nickname || 'None', inline: true },
      { name: 'Account Created', value: `<t:${Math.floor(u.createdTimestamp / 1000)}:R>`, inline: true },
      { name: 'Joined Server', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true },
      { name: 'Roles', value: target.roles.cache.filter(r => r.id !== message.guild.id).map(r => `${r}`).join(', ') || 'None' }
    ]
  })] });
}

async function cmdMemberCount(message) {
  const g = message.guild;
  return message.reply({ embeds: [makeEmbed({
    title: '👥 Member Count',
    fields: [
      { name: 'Total Members', value: `${g.memberCount}`, inline: true },
      { name: 'Humans', value: `${g.members.cache.filter(m => !m.user.bot).size}`, inline: true },
      { name: 'Bots', value: `${g.members.cache.filter(m => m.user.bot).size}`, inline: true },
    ]
  })] });
}

async function cmdInvites(message) {
  const target = message.mentions.users.first() || message.author;
  const row = dbq.prepare('SELECT * FROM invites WHERE guild_id = ? AND user_id = ?').get(message.guild.id, target.id);
  const joins = row?.join_count || 0;
  const leaves = row?.leave_count || 0;
  const fakes = row?.fake_count || 0;
  const real = Math.max(0, joins - leaves - fakes);
  return message.reply({ embeds: [makeEmbed({
    title: `📨 Invites for ${target.username}`,
    fields: [
      { name: 'Total Joins', value: `${joins}`, inline: true },
      { name: 'Real', value: `${real}`, inline: true },
      { name: 'Left', value: `${leaves}`, inline: true },
      { name: 'Fake', value: `${fakes}`, inline: true },
    ]
  })] });
}

async function cmdInviteLeaderboard(message) {
  const rows = dbq.prepare('SELECT * FROM invites WHERE guild_id = ? ORDER BY join_count DESC LIMIT 50').all(message.guild.id);
  if (!rows.length) return message.reply({ embeds: [makeEmbed({ title: '🏆 Invite Leaderboard', description: 'No invite data yet.' })] });

  const perPage = 10;
  const pages = Math.ceil(rows.length / perPage);
  let page = 0;

  function buildPage(p) {
    const slice = rows.slice(p * perPage, (p + 1) * perPage);
    const desc = slice.map((r, i) => {
      const real = Math.max(0, r.join_count - r.leave_count - r.fake_count);
      return `**${p * perPage + i + 1}.** <@${r.user_id}> — **${real}** real (${r.join_count} joins, ${r.leave_count} left, ${r.fake_count} fake)`;
    }).join('\n');
    return makeEmbed({ title: '🏆 Invite Leaderboard', description: desc, footer: { text: `Page ${p + 1}/${pages}` } });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ilb_prev').setLabel('◀ Back').setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('ilb_next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(pages <= 1),
  );

  const msg = await message.reply({ embeds: [buildPage(0)], components: pages > 1 ? [row] : [] });
  if (pages <= 1) return;

  const collector = msg.createMessageComponentCollector({ time: 60000 });
  collector.on('collect', async i => {
    if (i.user.id !== message.author.id) return i.reply({ content: 'Not your leaderboard!', ephemeral: true });
    if (i.customId === 'ilb_prev') page = Math.max(0, page - 1);
    if (i.customId === 'ilb_next') page = Math.min(pages - 1, page + 1);
    const newRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ilb_prev').setLabel('◀ Back').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId('ilb_next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= pages - 1),
    );
    await i.update({ embeds: [buildPage(page)], components: [newRow] });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

async function cmdInviteReset(message, args) {
  const sub = args[0]?.toLowerCase();
  if (sub === 'all') {
    if (!isAdmin(message.member)) return message.reply({ embeds: [errorEmbed('Admin only.')] });
    dbq.prepare('DELETE FROM invites WHERE guild_id = ?').run(message.guild.id);
    dbq.prepare('DELETE FROM invite_uses WHERE guild_id = ?').run(message.guild.id);
    return message.reply({ embeds: [successEmbed('Reset all invites in this server.')] });
  }
  const target = message.mentions.users.first();
  if (target && target.id !== message.author.id && !isAdmin(message.member)) {
    return message.reply({ embeds: [errorEmbed('You can only reset your own invites.')] });
  }
  const userId = target?.id || message.author.id;
  dbq.prepare('DELETE FROM invites WHERE guild_id = ? AND user_id = ?').run(message.guild.id, userId);
  dbq.prepare('DELETE FROM invite_uses WHERE guild_id = ? AND inviter_id = ?').run(message.guild.id, userId);
  return message.reply({ embeds: [successEmbed(`Reset invites for <@${userId}>.`)] });
}

async function cmdPing(message, _args, _config, client) {
  const sent = await message.reply({ embeds: [makeEmbed({ title: '🏓 Pinging...' })] });
  const roundtrip = sent.createdTimestamp - message.createdTimestamp;
  await sent.edit({ embeds: [makeEmbed({
    title: '🏓 Pong!',
    fields: [
      { name: '<:tickwa:1500815942576504974> WebSocket', value: `\`${client.ws.ping}ms\``, inline: true },
    ]
  })] });
}

async function cmdStopTimer(message, args) {
  if (!isAdmin(message.member)) return message.reply({ embeds: [errorEmbed('Admin only.')] });
  const id = parseInt(args[0]);
  if (isNaN(id)) {
    const timers = dbq.prepare('SELECT * FROM timers WHERE guild_id = ?').all(message.guild.id);
    if (!timers.length) return message.reply({ embeds: [makeEmbed({ title: '⏱️ Timers', description: 'No active timers.' })] });
    const desc = timers.map(t => `**#${t.id}** — every \`${Math.round(t.interval_ms / 60000)}m\` → ${t.message.slice(0, 50)}`).join('\n');
    return message.reply({ embeds: [makeEmbed({ title: '⏱️ Active Timers', description: desc + '\n\nUse `&stoptimer <id>` to stop one.' })] });
  }
  const timer = dbq.prepare('SELECT * FROM timers WHERE id = ? AND guild_id = ?').get(id, message.guild.id);
  if (!timer) return message.reply({ embeds: [errorEmbed(`Timer #${id} not found.`)] });
  dbq.prepare('DELETE FROM timers WHERE id = ?').run(id);
  return message.reply({ embeds: [successEmbed(`Timer #${id} stopped and removed.`)] });
}

async function cmdTrigger(message, args) {
  if (!isAdmin(message.member)) return message.reply({ embeds: [errorEmbed('Admin only.')] });
  const sub = args[0]?.toLowerCase();
  if (sub === 'add') {
    const trigger = args[1];
    const type = args[2]?.toLowerCase() === 'reaction' ? 'reaction' : 'message';
    const response = args.slice(type === 'reaction' ? 3 : 2).join(' ');
    if (!trigger || !response) return message.reply({ embeds: [errorEmbed('Usage: `&trigger add <word> <response>` or `&trigger add <word> reaction <emoji>`')] });
    dbq.prepare('INSERT INTO triggers (guild_id, trigger, response, type) VALUES (?,?,?,?)').run(message.guild.id, trigger.toLowerCase(), response, type);
    return message.reply({ embeds: [successEmbed(`Trigger added! When someone says \`${trigger}\`, bot will ${type === 'reaction' ? 'react with' : 'reply with'} \`${response}\`.`)] });
  }
  if (sub === 'remove') {
    const id = parseInt(args[1]);
    if (isNaN(id)) return message.reply({ embeds: [errorEmbed('Provide trigger ID.')] });
    dbq.prepare('DELETE FROM triggers WHERE id = ? AND guild_id = ?').run(id, message.guild.id);
    return message.reply({ embeds: [successEmbed(`Trigger #${id} removed.`)] });
  }
  if (sub === 'list') {
    const triggers = dbq.prepare('SELECT * FROM triggers WHERE guild_id = ?').all(message.guild.id);
    if (!triggers.length) return message.reply({ embeds: [makeEmbed({ title: '📋 Triggers', description: 'No triggers set.' })] });
    const desc = triggers.map(t => `**#${t.id}** \`${t.trigger}\` → ${t.type === 'reaction' ? '(react) ' : ''}${t.response}`).join('\n');
    return message.reply({ embeds: [makeEmbed({ title: '📋 Triggers', description: desc })] });
  }
  return message.reply({ embeds: [makeEmbed({ title: '⚙️ Trigger Help', description: '`&trigger add <word> <response>`\n`&trigger add <word> reaction <emoji>`\n`&trigger remove <id>`\n`&trigger list`' })] });
}

const GWY_ID   = '1499427298242199695';
const GWY_REACT = '<a:giveaway:1499427298242199695>';
const PRIZE_E   = '<:emoji_19:1492582929799450804>';
const BU        = '<:bu:1494241582176534632>';

const GWY_GIF = 'https://media1.tenor.com/m/0O7kPpdBghEAAAAC/%E0%B8%9D%E0%B8%99.gif';

function buildGwyEmbed(prize, winners, endsAt, hostTag) {
  return makeEmbed({
    title: `${PRIZE_E} ${prize} ${PRIZE_E}`,
    description: [
      `${BU} React with ${GWY_REACT} to enter!`,
      `${BU} **Winners:** ${winners}`,
      `${BU} **Ends:** <t:${Math.floor(endsAt / 1000)}:R> (<t:${Math.floor(endsAt / 1000)}:f>)`,
      `${BU} **Hosted by:** ${hostTag}`,
    ].join('\n'),
    image: GWY_GIF,
    timestamp: true,
  });
}

async function reactGwy(msg) {
  try { await msg.react(GWY_ID); } catch { try { await msg.react('🎉'); } catch {} }
}

async function cmdGiveawayMain(message, args) {
  const sub = args[0]?.toLowerCase();
  if (sub === 'start') return cmdGiveawayStart(message, args.slice(1));
  if (sub === 'end') return cmdGiveawayEnd(message, args.slice(1));
  if (sub === 'reroll') return cmdGiveawayReroll(message, args.slice(1));
  return message.reply({ embeds: [makeEmbed({ title: '🎉 Giveaway Help', description: '`&gs <duration> <winners> <prize>`\n`&ge <id>` — End giveaway\n`&gr <id>` — Reroll giveaway' })] });
}

async function cmdGiveawayStart(message, args) {
  if (!isAdmin(message.member)) return message.reply({ embeds: [errorEmbed('Admin only.')] });
  const durationStr = args[0];
  const winners = parseInt(args[1]) || 1;
  const prize = args.slice(2).join(' ');
  if (!durationStr || !prize) return message.reply({ embeds: [errorEmbed('Usage: `&gs <duration> <winners> <prize>`\nExample: `&gs 1h 1 Nitro`')] });
  const ms = parseTime(durationStr);
  if (!ms) return message.reply({ embeds: [errorEmbed('Invalid duration. Use 10m, 1h, 1d etc.')] });
  const endsAt = Date.now() + ms;
  const embed = buildGwyEmbed(prize, winners, endsAt, message.author.toString());
  const gMsg = await message.channel.send({ embeds: [embed] });
  await reactGwy(gMsg);
  dbq.prepare('INSERT INTO giveaways (guild_id, channel_id, message_id, prize, winners, ends_at, host_id) VALUES (?,?,?,?,?,?,?)').run(
    message.guild.id, message.channel.id, gMsg.id, prize, winners, endsAt, message.author.id
  );
  const id = dbq.lastInsertRowid();
  await message.reply({ embeds: [successEmbed(`Giveaway started! ID: **${id}**`)] });
}

async function cmdGiveawayEnd(message, args) {
  if (!isAdmin(message.member)) return message.reply({ embeds: [errorEmbed('Admin only.')] });
  const id = parseInt(args[0]);
  if (isNaN(id)) return message.reply({ embeds: [errorEmbed('Provide giveaway ID.')] });
  await endGiveaway(id, message.channel, message.guild);
  return message.reply({ embeds: [successEmbed('Giveaway ended.')] });
}

async function cmdGiveawayReroll(message, args) {
  if (!isAdmin(message.member)) return message.reply({ embeds: [errorEmbed('Admin only.')] });
  const id = parseInt(args[0]);
  if (isNaN(id)) return message.reply({ embeds: [errorEmbed('Provide giveaway ID.')] });
  const g = dbq.prepare('SELECT * FROM giveaways WHERE id = ? AND guild_id = ?').get(id, message.guild.id);
  if (!g) return message.reply({ embeds: [errorEmbed('Giveaway not found.')] });
  let participants;
  try { participants = JSON.parse(g.participants || '[]'); } catch { participants = []; }
  if (!participants.length) return message.reply({ embeds: [errorEmbed('No participants.')] });
  const winner = participants[Math.floor(Math.random() * participants.length)];
  return message.reply({ embeds: [makeEmbed({
    title: `${PRIZE_E} Giveaway Rerolled!`,
    description: `${BU} **New winner:** <@${winner}>\n${BU} **Prize:** ${g.prize}`,
  })] });
}

export async function endGiveaway(id, channel, guild) {
  const g = dbq.prepare('SELECT * FROM giveaways WHERE id = ?').get(id);
  if (!g || g.ended) return;

  let participants;
  try { participants = JSON.parse(g.participants || '[]'); } catch { participants = []; }

  if (!participants.length) {
    try {
      const ch = channel || await guild.channels.fetch(g.channel_id);
      const msg = await ch.messages.fetch(g.message_id);
      const reaction = msg.reactions.cache.get(GWY_ID) || msg.reactions.cache.get('🎉');
      if (reaction) {
        const users = await reaction.users.fetch();
        participants = users.filter(u => !u.bot).map(u => u.id);
        dbq.prepare('UPDATE giveaways SET participants = ? WHERE id = ?').run(JSON.stringify(participants), id);
      }
    } catch {}
  }

  dbq.prepare('UPDATE giveaways SET ended = 1 WHERE id = ?').run(id);

  const ch = channel || (guild ? await guild.channels.fetch(g.channel_id).catch(() => null) : null);
  if (!ch) return;

  const endedTs = Math.floor(Date.now() / 1000);

  if (!participants.length) {
    return ch.send({ embeds: [makeEmbed({
      title: `${PRIZE_E} Giveaway Ended`,
      description: `${BU} **Prize:** ${g.prize}\n${BU} No valid participants!\n\nEnded at | <t:${endedTs}:f>`,
    })] });
  }

  const winnerCount = Math.min(g.winners, participants.length);
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, winnerCount);

  await ch.send({ embeds: [makeEmbed({
    title: `${PRIZE_E} Giveaway Ended`,
    description: [
      `${BU} **Prize:** ${g.prize}`,
      `${BU} **Winner${winners.length > 1 ? 's' : ''}:** ${winners.map(w => `<@${w}>`).join(', ')}`,
      `${BU} **Participants:** ${participants.length}`,
      `${BU} **Hosted by:** <@${g.host_id}>`,
      ``,
      `Ended at | <t:${endedTs}:f>`,
    ].join('\n'),
  })] });

  ch.send(`🎊 Congratulations ${winners.map(w => `<@${w}>`).join(', ')}! You won **${g.prize}**!`);
}

export async function checkGiveaways(client) {
  const now = Date.now();
  const due = dbq.prepare('SELECT * FROM giveaways WHERE ended = 0 AND ends_at <= ?').all(now);
  for (const g of due) {
    try {
      const guild = await client.guilds.fetch(g.guild_id);
      const channel = await guild.channels.fetch(g.channel_id);
      await endGiveaway(g.id, channel, guild);
    } catch {}
  }
}

export async function handleTriggers(message) {
  if (!message.guild || message.author.bot) return;
  const content = message.content.toLowerCase();
  const triggers = dbq.prepare('SELECT * FROM triggers WHERE guild_id = ?').all(message.guild.id);
  for (const t of triggers) {
    if (content.includes(t.trigger)) {
      if (t.type === 'reaction') {
        try { await message.react(t.response); } catch {}
      } else {
        await message.channel.send(t.response).catch(() => {});
      }
    }
  }
}

export async function handleInviteJoin(member, inviteCache) {
  const guild = member.guild;
  try {
    const newInvites = await guild.invites.fetch();
    const cachedGuild = inviteCache.get(guild.id);
    let usedInviterId = null;

    if (cachedGuild) {
      for (const [code, inv] of newInvites) {
        const cached = cachedGuild.get(code);
        if (cached && inv.uses > cached.uses) {
          usedInviterId = cached.inviterId;
          break;
        }
      }
    }

    inviteCache.set(guild.id, new Map(newInvites.map(inv => [inv.code, { uses: inv.uses, inviterId: inv.inviter?.id }])));

    const existingInvitee = dbq.prepare('SELECT * FROM invites WHERE guild_id = ? AND user_id = ?').get(guild.id, member.id);
    const isFake = !!existingInvitee;

    dbq.prepare('INSERT OR IGNORE INTO invites (guild_id, user_id) VALUES (?,?)').run(guild.id, member.id);
    if (usedInviterId) {
      dbq.prepare('UPDATE invites SET inviter_id = ? WHERE guild_id = ? AND user_id = ?').run(usedInviterId, guild.id, member.id);
      dbq.prepare('INSERT OR IGNORE INTO invites (guild_id, user_id) VALUES (?,?)').run(guild.id, usedInviterId);
      dbq.prepare('UPDATE invites SET join_count = join_count + 1, fake_count = fake_count + ? WHERE guild_id = ? AND user_id = ?').run(isFake ? 1 : 0, guild.id, usedInviterId);
      dbq.prepare('INSERT INTO invite_uses (guild_id, inviter_id, invitee_id, timestamp, type) VALUES (?,?,?,?,?)').run(guild.id, usedInviterId, member.id, Date.now(), 'join');
    }
  } catch (e) {
    console.error('Invite join error:', e.message);
  }
}

export async function handleInviteLeave(member) {
  const guild = member.guild;
  const row = dbq.prepare('SELECT * FROM invites WHERE guild_id = ? AND user_id = ?').get(guild.id, member.id);
  if (row?.inviter_id) {
    dbq.prepare('UPDATE invites SET leave_count = leave_count + 1 WHERE guild_id = ? AND user_id = ?').run(guild.id, row.inviter_id);
    dbq.prepare('INSERT INTO invite_uses (guild_id, inviter_id, invitee_id, timestamp, type) VALUES (?,?,?,?,?)').run(guild.id, row.inviter_id, member.id, Date.now(), 'leave');
  }
}

export async function handleGiveawaySlash(interaction) {
  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;

  if (sub === 'start') {
    if (!isAdmin(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Admin only.')], ephemeral: true });
    const prize = interaction.options.getString('prize');
    const durationStr = interaction.options.getString('duration');
    const winners = interaction.options.getInteger('winners') || 1;
    const ms = parseTime(durationStr);
    if (!ms) return interaction.reply({ embeds: [errorEmbed('Invalid duration.')], ephemeral: true });
    const endsAt = Date.now() + ms;
    await interaction.deferReply({ ephemeral: true });
    const embed = buildGwyEmbed(prize, winners, endsAt, interaction.user.toString());
    const gMsg = await interaction.channel.send({ embeds: [embed] });
    await reactGwy(gMsg);
    dbq.prepare('INSERT INTO giveaways (guild_id, channel_id, message_id, prize, winners, ends_at, host_id) VALUES (?,?,?,?,?,?,?)').run(guild.id, interaction.channel.id, gMsg.id, prize, winners, endsAt, interaction.user.id);
    const id = dbq.lastInsertRowid();
    return interaction.editReply({ embeds: [successEmbed(`Giveaway started! ID: **${id}**`)] });
  }

   if (sub === 'end') {
    if (!isAdmin(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Admin only.')], ephemeral: true });
    const id = interaction.options.getInteger('id');
    await endGiveaway(id, interaction.channel, guild);
    return interaction.reply({ embeds: [successEmbed('Giveaway ended.')], ephemeral: true });
  }

  if (sub === 'reroll') {
    if (!isAdmin(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Admin only.')], ephemeral: true });
    const id = interaction.options.getInteger('id');
    const g = dbq.prepare('SELECT * FROM giveaways WHERE id = ? AND guild_id = ?').get(id, guild.id);
    if (!g) return interaction.reply({ embeds: [errorEmbed('Giveaway not found.')], ephemeral: true });
    let participants;
    try { participants = JSON.parse(g.participants || '[]'); } catch { participants = []; }
    if (!participants.length) return interaction.reply({ embeds: [errorEmbed('No participants.')], ephemeral: true });
    const winner = participants[Math.floor(Math.random() * participants.length)];
    return interaction.reply({ embeds: [makeEmbed({
      title: `${PRIZE_E} Giveaway Rerolled!`,
      description: `${BU} **New winner:** <@${winner}>\n${BU} **Prize:** ${g.prize}`,
    })] });
  }
}  
