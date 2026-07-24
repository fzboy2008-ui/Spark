const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Open the secure server configuration control panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('⚙️ Spark Elite Control Dashboard')
            .setDescription('Manage your server modules cleanly and securely using the controls below.')
            .setColor('#5865F2')
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('setup_spark_center').setLabel('Spark Center Setup').setStyle(ButtonStyle.Primary).setEmoji('🛡️'),
            new ButtonBuilder().setCustomId('setup_welcome_btn').setLabel('Welcome Setup').setStyle(ButtonStyle.Success).setEmoji('✨')
        );

        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
};
