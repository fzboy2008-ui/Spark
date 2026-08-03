const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('customvc')
        .setDescription('Configure auto-spawning private voice channels system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(s => s.setName('panel').setDescription('Open Custom VC administrative setup panel')),

    async execute(interaction) {
        if (interaction.options.getSubcommand() === 'panel') {
            const embed = new EmbedBuilder()
                .setTitle('🔊 CUSTOM VOICE CHANNELS MANAGER')
                .setDescription('Configure your server automated voice channels system. When users join the designated master join voice channel, a private VC is automatically spawned for them and deleted once empty.')
                .setColor('#5865F2')
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('setup_customvc_btn').setLabel('Setup Custom VC').setEmoji('<a:update:1531251219975114752>').setStyle(ButtonStyle.Primary)
            );

            return await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }
    }
};
