const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("store")
        .setDescription("Open Storefront Admin Dashboard")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName("panel")
                .setDescription("Deploy administrative store management dashboard panel")
        ),

    async execute(interaction) {
        if (interaction.options.getSubcommand() === "panel") {
            const embed = new EmbedBuilder()
                .setTitle("🛒 Store Control Dashboard")
                .setDescription("Welcome to the Store Engine Panel. Select a setup module below to configure your store settings dynamically.")
                .setColor("#5865F2")
                .setTimestamp();

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("setup_store_cfg").setLabel("1. Basic Setup & Stock").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("setup_store_visual").setLabel("2. Deploy Visual Panel").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId("setup_store_execution").setLabel("3. Console & Commands").setStyle(ButtonStyle.Secondary)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("setup_store_dms").setLabel("4. DM Alerts Settings").setStyle(ButtonStyle.Danger)
            );

            return await interaction.reply({
                embeds: [embed],
                components: [row1, row2],
                ephemeral: true
            });
        }
    }
};
