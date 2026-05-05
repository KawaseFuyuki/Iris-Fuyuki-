import { EmbedBuilder } from 'discord.js';

export async function handleHelp(message, args, config, client) {
  const embed = new EmbedBuilder()
    .setTitle('<:roses:1498751220330926141> Iris Fuyuki Help Menu')
    .setColor(0xFFD700)
    .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
    .addFields(
      {
        name: '<:_Fixed:1498750907175931958> Moderation',
        value: '`ban` `unban` `mute` `unmute` `warn` `warnings` `clearwarns` `purge` `lock` `unlock`',
      },
      {
        name: '<:Fixar:1498750944144392273> Info',
        value: '`avatar` `userinfo` `serverinfo` `membercount` `invites` `inviteleaderboard` `trigger`',
      },
      {
        name: '⚙️ Server Setup',
        value: '`/welcome` `/ticket setup` `/ticket close` `/embed` `/reactionrole` `/temprole` `/timer`',
      },
      {
        name: '🎉 Giveaway',
        value: '`gs` `ge` `gr` *(or `/giveaway start/end/reroll`)*',
      },
      {
        name: '<:tickwa:1500815942576504974> Ticket',
        value: '`/ticket setup` `/ticket addbutton` `/ticket close`',
      },
      {
        name: '🔧 Utility',
        value: '`ping` `snipe` `stoptimer <id>` `antilink` `antinuke`',
      },
    )
    .setImage('https://media1.tenor.com/m/0O7kPpdBghEAAAAC/%E0%B8%9D%E0%B8%99.gif')
    .setFooter({ text: `Iris Fuyuki 24/7 • Prefix: ${config.prefix || '&'}` });

  return message.reply({ embeds: [embed] });
}

