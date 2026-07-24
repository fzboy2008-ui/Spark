const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Open the bot configuration control panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
            const embed = {
                title: '⚙️ Bot Configuration Dashboard',
                description: 'Welcome to the control panel. Select a module below to configure your server setup dynamically.',
                color: 0x5865F2
            };

            // Max 5 buttons are allowed in a single row
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_tickets_btn')
                    .setLabel('Setup Tickets')
                    .setEmoji('🎫')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('setup_welcome_btn')
                    .setLabel('Setup Welcome')
                    .setEmoji('✨')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('setup_stats_btn')
                    .setLabel('Setup Server Stats')
                    .setEmoji('📊')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('setup_youtube_btn')
                    .setLabel('Setup YouTube')
                    .setEmoji('📺')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('setup_auto_btn')
                    .setLabel('Auto Response')
                    .setEmoji('💬')
                    .setStyle(ButtonStyle.Primary)
            );

            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }
    }
};
