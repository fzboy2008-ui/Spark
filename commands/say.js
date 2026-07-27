const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("say")
        .setDescription("Send an administrative message formatted inside an embed")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt =>
            opt.setName("channel")
                .setRequired(true)
                .setDescription("Select the target text channel")
        )
        .addStringOption(opt =>
            opt.setName("message")
                .setRequired(true)
                .setDescription("Type your message content (use \\n for new lines)")
        ),

    async execute(interaction) {
        const channel = interaction.options.getChannel("channel");
        const message = interaction.options.getString("message");

        const formattedMessage = message.replace(/\\n/g, '\n');

        if (!channel.isTextBased()) {
            return interaction.reply({
                content: "❌ The selected target must be a valid text channel.",
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setDescription(formattedMessage)
            .setColor("Blue")
            .setFooter({ text: `Sent by ${interaction.user.tag}` })
            .setTimestamp();

        await channel.send({ embeds: [embed] });

        return interaction.reply({
            content: "✅ Message sent successfully as an embed!",
            ephemeral: true
        });
    }
};
