const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Open the main bot configuration control panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
            const embed = {
                title: '⚙️ BOT CONFIGURATION DASHBOARD',
                description: 'Welcome to the administration control panel. Select any module below to configure your server systems dynamically.',
                color: 0x5865F2
            };

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_tickets_btn')
                    .setLabel('Tickets')
                    .setEmoji('<a:store_cart:1531251190275379282>')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('setup_welcome_btn')
                    .setLabel('Welcome')
                    .setEmoji('<a:welcome:1531251234147794964>')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('setup_stats_btn')
                    .setLabel('Stats')
                    .setEmoji('<a:report:1531250976617402418>')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('setup_youtube_btn')
                    .setLabel('YouTube')
                    .setEmoji('<a:announcement:1531251217525768324>')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('setup_auto_btn')
                    .setLabel('Auto-Response')
                    .setEmoji('<a:update:1531251219975114752>')
                    .setStyle(ButtonStyle.Primary)
            );

            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }
    }
};
