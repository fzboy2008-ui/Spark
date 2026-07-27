const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('application')
        .setDescription('Staff application panel configuration system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(s => s.setName('panel').setDescription('Deploy the staff application panel')),

    async execute(interaction) {
        if (interaction.options.getSubcommand() === 'panel') {
            const embed = new EmbedBuilder()
                .setTitle('📝 STAFF APPLICATION MANAGEMENT')
                .setDescription('Configure your staff application system settings or deploy the interactive panel to your designated channel using the buttons below.')
                .setColor('#5865F2')
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('setup_app_config').setLabel('Configure System').setEmoji('<a:update:1531251219975114752>').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('deploy_app_panel').setLabel('Deploy Panel').setEmoji('<a:welcome:1531251234147794964>').setStyle(ButtonStyle.Success)
            );

            return await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }
    }
};
