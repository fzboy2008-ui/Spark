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
                .setTitle("🛒 STORE MANAGEMENT DASHBOARD")
                .setDescription("Welcome to the Store Engine Panel. Select a setup module below to configure your store inventory, visual layouts, console commands, and custom DM alerts dynamically.")
                .setColor("#5865F2")
                .setTimestamp();

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("setup_store_cfg").setLabel("1. Stock Setup").setEmoji("<a:store_cart:1531251190275379282>").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("setup_store_visual").setLabel("2. Visual Panel").setEmoji("<a:gift:1531251179235840051>").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId("setup_store_execution").setLabel("3. Console Config").setEmoji("<a:update:1531251219975114752>").setStyle(ButtonStyle.Secondary)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("setup_store_dms").setLabel("4. DM Alerts Settings").setEmoji("<a:alert:1531250980199338064>").setStyle(ButtonStyle.Danger)
            );

            return await interaction.reply({
                embeds: [embed],
                components: [row1, row2],
                ephemeral: true
            });
        }
    }
};
