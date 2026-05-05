import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { dbq, getGuildConfig } from '../../database.js';
import { makeEmbed, errorEmbed, successEmbed, parseTime, formatDuration } from '../../utils.js';

export const slashCommands = [
  new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Add a reaction role to a message')
    .addStringOption(o => o.setName('message_id').setDescription('Message ID').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji to react with').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('reactionrole-image')
    .setDescription('Add reaction role by image name in embed')
    .addStringOption(o => o.setName('message_id').setDescription('Message ID').setRequired(true))
    .addStringOption(o => o.setName('image_name').setDescription('Image name keyword').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('addrole')
    .setDescription('Add a role to a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('removerole')
    .setDescription('Remove a role from a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('temprole')
    .setDescription('Give a user a temporary role')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 10m, 2h, 1d').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('timer')
    .setDescription('Set a recurring message timer')
    .addStringOption(o => o.setName('interval').setDescription('Interval e.g. 30m, 1h').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message to send').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('rr-list')
    .setDescription('List all reaction roles in this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('rr-remove')
    .setDescription('Remove a reaction role by ID')
    .addIntegerOption(o => o.setName('id').setDescription('Reaction role ID from /rr-list').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
];

export async function handleSlash(interaction) {
  const { commandName, guild } = interaction;

  if (commandName === 'reactionrole') {
    const messageId = interaction.options.getString('message_id');
    const emoji = interaction.options.getString('emoji');
    const role = interaction.options.getRole('role');
    const channel = interaction.channel;
    let msg;
    try { msg = await channel.messages.fetch(messageId); } catch {
      return interaction.reply({ embeds: [errorEmbed('Message not found in this channel.')], ephemeral: true });
    }
    try { await msg.react(emoji); } catch {
      return interaction.reply({ embeds: [errorEmbed('Could not react with that emoji.')], ephemeral: true });
    }
    dbq.prepare('INSERT INTO reaction_roles (guild_id, channel_id, message_id, emoji, role_id) VALUES (?,?,?,?,?)').run(guild.id, channel.id, messageId, emoji, role.id);
    return interaction.reply({ embeds: [successEmbed(`Reaction role added! React ${emoji} on that message to get ${role}.`)], ephemeral: true });
  }

  if (commandName === 'reactionrole-image') {
    const messageId = interaction.options.getString('message_id');
    const imageName = interaction.options.getString('image_name').toLowerCase();
    const role = interaction.options.getRole('role');
    const channel = interaction.channel;
    let msg;
    try { msg = await channel.messages.fetch(messageId); } catch {
      return interaction.reply({ embeds: [errorEmbed('Message not found.')], ephemeral: true });
    }
    const embed = msg.embeds[0];
    const imgUrl = embed?.image?.url || embed?.thumbnail?.url || '';
    if (!imgUrl.toLowerCase().includes(imageName)) {
      return interaction.reply({ embeds: [errorEmbed(`No image matching "${imageName}" found in that message's embed.`)], ephemeral: true });
    }
    await msg.react('✅');
    dbq.prepare('INSERT INTO reaction_roles (guild_id, channel_id, message_id, emoji, role_id) VALUES (?,?,?,?,?)').run(guild.id, channel.id, messageId, '✅', role.id);
    return interaction.reply({ embeds: [successEmbed(`Image-based reaction role set for "${imageName}" → ${role}.`)], ephemeral: true });
  }

  if (commandName === 'addrole') {
    const user = interaction.options.getMember('user');
    const role = interaction.options.getRole('role');
    try {
      await user.roles.add(role);
      return interaction.reply({ embeds: [successEmbed(`Added ${role} to ${user}.`)] });
    } catch {
      return interaction.reply({ embeds: [errorEmbed('Could not add role. Check bot permissions.')], ephemeral: true });
    }
  }

  if (commandName === 'removerole') {
    const user = interaction.options.getMember('user');
    const role = interaction.options.getRole('role');
    try {
      await user.roles.remove(role);
      return interaction.reply({ embeds: [successEmbed(`Removed ${role} from ${user}.`)] });
    } catch {
      return interaction.reply({ embeds: [errorEmbed('Could not remove role.')], ephemeral: true });
    }
  }

  if (commandName === 'temprole') {
    const user = interaction.options.getMember('user');
    const role = interaction.options.getRole('role');
    const durationStr = interaction.options.getString('duration');
    const ms = parseTime(durationStr);
    if (!ms) return interaction.reply({ embeds: [errorEmbed('Invalid duration. Use formats like 10m, 2h, 1d.')], ephemeral: true });
    try { await user.roles.add(role); } catch {
      return interaction.reply({ embeds: [errorEmbed('Could not add role.')], ephemeral: true });
    }
    const expiresAt = Date.now() + ms;
    dbq.prepare('INSERT INTO temp_roles (guild_id, user_id, role_id, expires_at) VALUES (?,?,?,?)').run(guild.id, user.id, role.id, expiresAt);
    return interaction.reply({ embeds: [successEmbed(`Gave ${user} the ${role} role for ${formatDuration(ms)}.`)] });
  }

  if (commandName === 'timer') {
    const intervalStr = interaction.options.getString('interval');
    const message = interaction.options.getString('message');
    const ms = parseTime(intervalStr);
    if (!ms) return interaction.reply({ embeds: [errorEmbed('Invalid interval.')], ephemeral: true });
    dbq.prepare('INSERT INTO timers (guild_id, channel_id, message, interval_ms, next_run) VALUES (?,?,?,?,?)').run(guild.id, interaction.channelId, message, ms, Date.now() + ms);
    return interaction.reply({ embeds: [successEmbed(`Timer set! Message will repeat every ${intervalStr}.`)] });
  }

  if (commandName === 'rr-list') {
    const rows = dbq.prepare('SELECT * FROM reaction_roles WHERE guild_id = ?').all(guild.id);
    if (!rows.length) return interaction.reply({ embeds: [makeEmbed({ title: '📋 Reaction Roles', description: 'No reaction roles set up.' })], ephemeral: true });
    const desc = rows.map(r => `**ID ${r.id}** — <#${r.channel_id}> | Msg \`${r.message_id}\` | ${r.emoji} → <@&${r.role_id}>`).join('\n');
    return interaction.reply({ embeds: [makeEmbed({ title: '📋 Reaction Roles', description: desc })], ephemeral: true });
  }

  if (commandName === 'rr-remove') {
    const id = interaction.options.getInteger('id');
    const row = dbq.prepare('SELECT * FROM reaction_roles WHERE id = ? AND guild_id = ?').get(id, guild.id);
    if (!row) return interaction.reply({ embeds: [errorEmbed('Reaction role not found.')], ephemeral: true });
    dbq.prepare('DELETE FROM reaction_roles WHERE id = ?').run(id);
    return interaction.reply({ embeds: [successEmbed(`Reaction role #${id} removed.`)] });
  }
}

export async function handleReactionAdd(reaction, user) {
  if (user.bot) return;
  if (reaction.partial) try { await reaction.fetch(); } catch { return; }
  const guild = reaction.message.guild;
  if (!guild) return;
  const emoji = reaction.emoji.id
    ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
    : reaction.emoji.name;
  const rows = dbq.prepare('SELECT * FROM reaction_roles WHERE guild_id = ? AND message_id = ? AND emoji = ?').all(guild.id, reaction.message.id, emoji);
  for (const row of rows) {
    try {
      const member = await guild.members.fetch(user.id);
      await member.roles.add(row.role_id);
    } catch {}
  }
}

export async function handleReactionRemove(reaction, user) {
  if (user.bot) return;
  if (reaction.partial) try { await reaction.fetch(); } catch { return; }
  const guild = reaction.message.guild;
  if (!guild) return;
  const emoji = reaction.emoji.id
    ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
    : reaction.emoji.name;
  const rows = dbq.prepare('SELECT * FROM reaction_roles WHERE guild_id = ? AND message_id = ? AND emoji = ?').all(guild.id, reaction.message.id, emoji);
  for (const row of rows) {
    try {
      const member = await guild.members.fetch(user.id);
      await member.roles.remove(row.role_id);
    } catch {}
  }
}

export async function checkTempRoles(client) {
  const now = Date.now();
  const expired = dbq.prepare('SELECT * FROM temp_roles WHERE expires_at <= ?').all(now);
  for (const row of expired) {
    try {
      const guild = await client.guilds.fetch(row.guild_id);
      const member = await guild.members.fetch(row.user_id);
      await member.roles.remove(row.role_id);
    } catch {}
    dbq.prepare('DELETE FROM temp_roles WHERE id = ?').run(row.id);
  }
}

export async function checkTimers(client) {
  const now = Date.now();
  const due = dbq.prepare('SELECT * FROM timers WHERE next_run <= ?').all(now);
  for (const timer of due) {
    try {
      const guild = await client.guilds.fetch(timer.guild_id);
      const channel = await guild.channels.fetch(timer.channel_id);
      await channel.send(timer.message);
    } catch {}
    dbq.prepare('UPDATE timers SET next_run = ? WHERE id = ?').run(now + timer.interval_ms, timer.id);
  }
      }
      
