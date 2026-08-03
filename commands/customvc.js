const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('customvc')
        .setDescription('Custom Voice Channel (Join-to-Create) configuration system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(s => s.setName('panel').setDescription('Deploy or configure the Custom VC system')),

    async execute(interaction) {
        if (interaction.options.getSubcommand() === 'panel') {
            const embed = new EmbedBuilder()
                .setTitle('<a:game_controler:1531250960427384952> CUSTOM VOICE CHANNELS DASHBOARD')
                .setDescription('Configure your Join-to-Create temporary voice channel system using the button below.')
                .setColor('#5865F2')
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('setup_customvc_config').setLabel('Configure VC System').setEmoji('<a:update:1531251219975114752>').setStyle(ButtonStyle.Primary)
            );

            return await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }
    }
};
