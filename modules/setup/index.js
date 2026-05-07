import {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, ChannelType
} from 'discord.js';
import { dbq, getGuildConfig, setGuildConfig } from '../../database.js';
import { makeEmbed, errorEmbed, successEmbed, isAdmin, YELLOW } from '../../utils.js';

export const slashCommands = [
  new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Welcome message setup')
    .addSubcommand(s => s.setName('setup').setDescription('Setup welcome message')
      .addChannelOption(o => o.setName('channel').setDescription('Welcome channel').setRequired(true))
      .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Description (use {user}, {server}, {count})').setRequired(true))
      .addStringOption(o => o.setName('color').setDescription('Hex color e.g. #FFD700').setRequired(false))
      .addStringOption(o => o.setName('image').setDescription('Image URL').setRequired(false)))
    .addSubcommand(s => s.setName('test').setDescription('Test welcome message'))
    .addSubcommand(s => s.setName('remove').setDescription('Remove welcome system'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system setup')
    .addSubcommand(s => s.setName('setup').setDescription('Setup ticket system')
      .addChannelOption(o => o.setName('channel').setDescription('Channel for ticket panel').setRequired(true))
      .addStringOption(o => o.setName('title').setDescription('Panel title').setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Panel description').setRequired(true))
      .addStringOption(o => o.setName('category').setDescription('Category ID for ticket channels').setRequired(false))
      .addRoleOption(o => o.setName('role').setDescription('Staff role to ping').setRequired(false))
      .addStringOption(o => o.setName('emoji').setDescription('Button emoji').setRequired(false))
      .addStringOption(o => o.setName('color').setDescription('Embed color hex').setRequired(false))
      .addStringOption(o => o.setName('button_name').setDescription('Button text').setRequired(false))
      .addStringOption(o => o.setName('image').setDescription('Image URL').setRequired(false)))
    .addSubcommand(s => s.setName('addbutton').setDescription('Add extra button to ticket panel (max 3)')
      .addStringOption(o => o.setName('label').setDescription('Button label').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Button emoji').setRequired(false)))
    .addSubcommand(s => s.setName('close').setDescription('Close this ticket channel'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Send a custom embed to a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Channel to send embed').setRequired(true))
    .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Embed description').setRequired(true))
    .addStringOption(o => o.setName('color').setDescription('Hex color e.g. #FFD700').setRequired(false))
    .addStringOption(o => o.setName('image').setDescription('Image URL').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
];

export async function handleSlash(interaction) {
  const { commandName, guild } = interaction;

  if (commandName === 'welcome') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description');
      const color = interaction.options.getString('color') || '#FFD700';
      const image = interaction.options.getString('image') || null;
      setGuildConfig(guild.id, { welcome_channel: channel.id, welcome_title: title, welcome_description: description, welcome_color: color, welcome_image: image });
      return interaction.reply({ embeds: [successEmbed(`Welcome system set up in ${channel}!\nTest it with \`/welcome test\`.`)], ephemeral: true });
    }
    if (sub === 'test') {
      const config = getGuildConfig(guild.id);
      if (!config.welcome_channel) return interaction.reply({ embeds: [errorEmbed('Welcome not set up yet. Use `/welcome setup` first.')], ephemeral: true });
      const channel = await guild.channels.fetch(config.welcome_channel).catch(() => null);
      if (!channel) return interaction.reply({ embeds: [errorEmbed('Welcome channel not found.')], ephemeral: true });
      const embed = buildWelcomeEmbed(config, interaction.member, guild);
      await channel.send({ embeds: [embed] });
      return interaction.reply({ embeds: [successEmbed('Test welcome sent!')], ephemeral: true });
    }
    if (sub === 'remove') {
      setGuildConfig(guild.id, { welcome_channel: null, welcome_title: null, welcome_description: null });
      return interaction.reply({ embeds: [successEmbed('Welcome system removed.')], ephemeral: true });
    }
  }

  if (commandName === 'ticket') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description');
      const category = interaction.options.getString('category') || null;
      const role = interaction.options.getRole('role') || null;
      const emoji = interaction.options.getString('emoji') || '🎫';
      const buttonName = interaction.options.getString('button_name') || 'Create Ticket';
      const color = interaction.options.getString('color') || '#FFD700';
      const image = interaction.options.getString('image') || null;

      setGuildConfig(guild.id, {
        ticket_channel: channel.id, ticket_category: category,
        ticket_role: role?.id || null, ticket_emoji: emoji,
        ticket_title: title, ticket_description: description,
        ticket_color: color, ticket_image: image, ticket_buttons: getGuildConfig(guild.id)?.ticket_buttons || []
      });

      const embed = makeEmbed({ title, description, color: parseHex(color), image });
      const btn = new ButtonBuilder().setCustomId('ticket_create').setLabel(buttonName).setEmoji(emoji).setStyle(ButtonStyle.Primary);
      await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
      return interaction.reply({ embeds: [successEmbed(`Ticket panel sent to ${channel}!`)], ephemeral: true });
    }

    if (sub === 'addbutton') {
      const label = interaction.options.getString('label');
      const emoji = interaction.options.getString('emoji') || null;
      const config = getGuildConfig(guild.id);
      const buttons = Array.isArray(config.ticket_buttons) ? config.ticket_buttons : [];
      if (buttons.length >= 3) return interaction.reply({ embeds: [errorEmbed('Max 3 extra buttons allowed.')], ephemeral: true });
      buttons.push({ label, emoji });
      setGuildConfig(guild.id, { ticket_buttons: buttons });

      if (config.ticket_channel) {
        try {
          const ch = await guild.channels.fetch(config.ticket_channel);
          const embed = makeEmbed({ title: config.ticket_title, description: config.ticket_description, color: parseHex(config.ticket_color), image: config.ticket_image });
          const mainBtn = new ButtonBuilder().setCustomId('ticket_create').setLabel('Create Ticket').setEmoji(config.ticket_emoji || '🎫').setStyle(ButtonStyle.Primary);
          const extraBtns = buttons.map((b, i) => {
            const bb = new ButtonBuilder().setCustomId(`ticket_extra_${i}`).setLabel(b.label).setStyle(ButtonStyle.Secondary);
            if (b.emoji) bb.setEmoji(b.emoji);
            return bb;
          });
          await ch.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(mainBtn, ...extraBtns)] });
        } catch {}
      }
      return interaction.reply({ embeds: [successEmbed(`Button "${label}" added!`)], ephemeral: true });
    }

    if (sub === 'close') {
      const ticket = dbq.prepare('SELECT * FROM tickets WHERE channel_id = ? AND closed = 0').get(interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [errorEmbed('This is not an open ticket.')], ephemeral: true });
      dbq.prepare('UPDATE tickets SET closed = 1 WHERE id = ?').run(ticket.id);
      await interaction.reply({ embeds: [makeEmbed({ title: '🎫 Ticket Closing', description: 'This ticket will be deleted in 5 seconds.' })] });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
  }

  if (commandName === 'embed') {
    const channel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const color = interaction.options.getString('color') || '#FFD700';
    const image = interaction.options.getString('image') || null;
    try {
      await channel.send({ embeds: [makeEmbed({ title, description, color: parseHex(color), image })] });
      return interaction.reply({ embeds: [successEmbed(`Embed sent to ${channel}!`)], ephemeral: true });
    } catch {
      return interaction.reply({ embeds: [errorEmbed('Could not send embed. Check permissions.')], ephemeral: true });
    }
  }
}

export async function handleTicketButton(interaction) {
  const { guild, customId } = interaction;

  if (customId === 'ticket_close') {
    const ticket = dbq.prepare('SELECT * FROM tickets WHERE channel_id = ? AND closed = 0').get(interaction.channel.id);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Not a ticket channel.')], ephemeral: true });
    dbq.prepare('UPDATE tickets SET closed = 1 WHERE id = ?').run(ticket.id);
    await interaction.reply({ embeds: [makeEmbed({ title: '🎫 Closing Ticket', description: 'Deleting in 5 seconds...' })] });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    return;
  }

  const config = getGuildConfig(guild.id);
  const buttons = Array.isArray(config.ticket_buttons) ? config.ticket_buttons : [];
  let label = 'ticket';
  if (customId === 'ticket_create') label = 'ticket';
  else if (customId.startsWith('ticket_extra_')) {
    const idx = parseInt(customId.split('_')[2]);
    label = (buttons[idx]?.label || 'ticket').toLowerCase().replace(/\s+/g, '-');
  }

  const existingTicket = dbq.prepare('SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND closed = 0').get(guild.id, interaction.user.id);
  if (existingTicket) {
    return interaction.reply({ embeds: [errorEmbed(`You already have an open ticket: <#${existingTicket.channel_id}>`)], ephemeral: true });
  }

  try {
    const channelName = `${label}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 100);
    const permOverwrites = [
      { id: guild.id, deny: ['ViewChannel'] },
      { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
    ];
    if (config.ticket_role) {
      permOverwrites.push({ id: config.ticket_role, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'] });
    }
    const ch = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: config.ticket_category || undefined,
      permissionOverwrites: permOverwrites
    });

    dbq.prepare('INSERT INTO tickets (guild_id, channel_id, user_id, created_at) VALUES (?,?,?,?)').run(guild.id, ch.id, interaction.user.id, Date.now());

    const closeBtn = new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger);
    await ch.send({
      content: `${interaction.user}${config.ticket_role ? ` | <@&${config.ticket_role}>` : ''}`,
      embeds: [makeEmbed({ title: `🎫 ${label.charAt(0).toUpperCase() + label.slice(1).replace(/-/g, ' ')} Ticket`, description: `Welcome ${interaction.user}! Please describe your issue and our staff will assist you shortly.` })],
      components: [new ActionRowBuilder().addComponents(closeBtn)]
    });
    return interaction.reply({ embeds: [successEmbed(`Your ticket has been created: ${ch}`)], ephemeral: true });
  } catch (e) {
    console.error('Ticket create error:', e.message);
    return interaction.reply({ embeds: [errorEmbed('Could not create ticket channel. Check bot permissions.')], ephemeral: true });
  }
}

export async function handleWelcome(member, config) {
  if (!config.welcome_channel) return;
  try {
    const channel = await member.guild.channels.fetch(config.welcome_channel);
    if (!channel) return;
    const embed = buildWelcomeEmbed(config, member, member.guild);
    await channel.send({ embeds: [embed] });
  } catch {}
}

function buildWelcomeEmbed(config, member, guild) {
  const desc = (config.welcome_description || 'Welcome to **{server}**, {user}! You are member #{count}.')
    .replace(/{user}/g, member.toString())
    .replace(/{server}/g, guild.name)
    .replace(/{count}/g, guild.memberCount);
  return makeEmbed({
    title: (config.welcome_title || `Welcome to ${guild.name}!`).replace(/{user}/g, member.user.username).replace(/{server}/g, guild.name),
    description: desc,
    color: parseHex(config.welcome_color) || YELLOW,
    image: config.welcome_image || null,
    thumbnail: member.user?.displayAvatarURL({ size: 256 }) || null,
    timestamp: true
  });
}

function parseHex(hex) {
  if (!hex) return YELLOW;
  const n = parseInt(String(hex).replace('#', ''), 16);
  return isNaN(n) ? YELLOW : n;
}
