const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const InviteData = require('../models/InviteData');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Invite tracking and event management system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(s => s.setName('panel').setDescription('Open the invite control panel'))
        .addSubcommand(s => s.setName('check').setDescription('Check event invites for a member').addUserOption(o => o.setName('user').setDescription('Target user')))
        .addSubcommand(s => s.setName('lifetime').setDescription('Check lifetime invites for a member').addUserOption(o => o.setName('user').setDescription('Target user'))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        // PANEL COMMAND
        if (sub === 'panel') {
            const embed = new EmbedBuilder()
                .setTitle('📩 INVITE TRACKER DASHBOARD')
                .setDescription('Select an action below to manage active event trackers, trigger dynamic leaderboards, or configure log feeds.')
                .setColor('#5865F2')
                .setTimestamp();

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_inv_start').setLabel('Start Event Tracker').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('btn_inv_reset').setLabel('Reset Event Data').setStyle(ButtonStyle.Danger)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_inv_guild_lb').setLabel('Guild Leaderboard').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('btn_inv_event_lb').setLabel('Invite Leaderboard').setStyle(ButtonStyle.Secondary)
            );

            const row3 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_inv_logs_cfg').setLabel('Setup Log Channel ID').setStyle(ButtonStyle.Secondary)
            );

            return await interaction.reply({ embeds: [embed], components: [row1, row2, row3] });
        }

        // CHECK & LIFETIME COMMANDS (INSTANT RESPONSE WITH DEFER)
        if (sub === 'check' || sub === 'lifetime') {
            await interaction.deferReply(); // Isse 'Thinking...' safely handle ho jayega

            const target = interaction.options.getUser('user') || interaction.user;
            const data = await InviteData.findOne({ guildId, userId: target.id }) || { eventRegular: 0, eventLeaves: 0, eventFake: 0, permRegular: 0, permLeaves: 0, permFake: 0 };
            
            const isLifetime = (sub === 'lifetime');
            const reg = isLifetime ? data.permRegular : data.eventRegular;
            const lvs = isLifetime ? data.permLeaves : data.eventLeaves;
            const fk = isLifetime ? data.permFake : data.eventFake;
            const total = reg - lvs - fk;

            const card = 
```text
👤 User      : ${target.tag}
📊 ${isLifetime ? 'Lifetime' : 'Event'}   : ${total} Invites
--------------------------------
🟢 Regular   : ${reg}
🔴 Leaves    : ${lvs}
⚠️ Fake      : ${fk}
```;

            const embed = new EmbedBuilder()
                .setTitle(isLifetime ? '🏆 LIFETIME INVITE PROFILE' : '⚡ EVENT INVITE PROFILE')
                .setDescription(card)
                .setColor(isLifetime ? '#00FF00' : '#FFCC00');

            return await interaction.editReply({ embeds: [embed] });
        }
    }
};
                
