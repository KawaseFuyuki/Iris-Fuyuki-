import { EmbedBuilder } from 'discord.js';

export const YELLOW = 0xFFD700;

export function makeEmbed(options = {}) {
  const embed = new EmbedBuilder().setColor(options.color ?? YELLOW);
  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.fields) embed.addFields(options.fields);
  if (options.image) embed.setImage(options.image);
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.footer) embed.setFooter(options.footer);
  if (options.timestamp) embed.setTimestamp();
  return embed;
}

export function errorEmbed(msg) {
  return makeEmbed({ title: '❌ Error', description: msg, color: 0xFF4444 });
}

export function successEmbed(msg) {
  return makeEmbed({ title: '✅ Success', description: msg });
}

export function isAdmin(member) {
  return member.permissions.has('Administrator');
}

export function isMod(member) {
  return member.permissions.has('ManageMessages') || member.permissions.has('Administrator');
}

export function parseTime(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const n = parseInt(match[1]);
  const unit = match[2];
  if (unit === 's') return n * 1000;
  if (unit === 'm') return n * 60 * 1000;
  if (unit === 'h') return n * 3600 * 1000;
  if (unit === 'd') return n * 86400 * 1000;
  return null;
}

export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function getPrefix(guildConfig) {
  return guildConfig?.prefix ?? '&';
}
