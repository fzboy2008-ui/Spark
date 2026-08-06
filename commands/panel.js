const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Open paginated bot configuration control panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(opt => 
            opt.setName('page')
               .setDescription('Select panel page (1, 2, or 3)')
               .setRequired(true)
               .addChoices(
                   { name: 'Page 1 (Welcome, Tickets, CustomVC)', value: 1 },
                   { name: 'Page 2 (YouTube, Auto-Response, Stats)', value: 2 },
                   { name: 'Page 3 (Invite Logs)', value: 3 }
               )
        ),

    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
            const page = interaction.options.getInteger('page');

            if (page === 1) {
                const embed = {
                    title: '⚙️ BOT CONFIGURATION PANEL — PAGE 1',
                    description: 'Manage core server systems: Welcome, Support Tickets, and Custom Voice Channels.',
                    color: 0x5865F2
                };
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('setup_welcome_btn').setLabel('Welcome').setEmoji('<a:welcome:1531251234147794964>').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('setup_tickets_btn').setLabel('Tickets').setEmoji('<a:store_cart:1531251190275379282>').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('setup_customvc_btn').setLabel('Custom VC').setEmoji('<a:store_cart:1531251190275379282>').setStyle(ButtonStyle.Secondary)
                );
                return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            }

            if (page === 2) {
                const embed = {
                    title: '⚙️ BOT CONFIGURATION PANEL — PAGE 2',
                    description: 'Manage automated systems: YouTube Alerts, Auto-Responses, and Member Stats & Goal.',
                    color: 0x5865F2
                };
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('setup_youtube_btn').setLabel('YouTube').setEmoji('<a:announcement:1531251217525768324>').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('setup_auto_btn').setLabel('Auto-Response').setEmoji('<a:update:1531251219975114752>').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('setup_stats_btn').setLabel('Stats & Goal').setEmoji('<a:report:1531250976617402418>').setStyle(ButtonStyle.Secondary)
                );
                return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            }

            if (page === 3) {
                const embed = {
                    title: '⚙️ BOT CONFIGURATION PANEL — PAGE 3',
                    description: 'Manage invite tracking log channel settings.',
                    color: 0x5865F2
                };
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_inv_logs_cfg').setLabel('Setup Invite Logs').setEmoji('<a:update:1531251219975114752>').setStyle(ButtonStyle.Secondary)
                );
                return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            }
        }
    }
};
