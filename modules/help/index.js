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
    .setImage('https://cdn.discordapp.com/attachments/1281623049757786163/1504192891545977044/IMG_20260429_115437_694.jpg?ex=6a06184b&is=6a04c6cb&hm=c5399c3461784f55f2b73753523e7c346cc02f399879de376a14fe68b6c312c4&')
    .setFooter({ text: `Iris Fuyuki 24/7 • Prefix: ${config.prefix || '&'}` });

  return message.reply({ embeds: [embed] });
}

