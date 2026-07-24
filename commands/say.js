const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("say")
        .setDescription("Send message as embed")
        // Default permission set to Administrator so only admins can see/use this slash command
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt =>
            opt.setName("channel")
                .setRequired(true)
                .setDescription("Select the channel to send embed")
        )
        .addStringOption(opt =>
            opt.setName("message")
                .setRequired(true)
                .setDescription("Type your message (Use \\n for new lines)")
        ),

    async execute(interaction) {
        const channel = interaction.options.getChannel("channel");
        const message = interaction.options.getString("message");

        // Processing formatting strings for visual breakout text configurations
        const formattedMessage = message.replace(/\\n/g, '\n');

        // Target channel validation deployment check
        if (!channel.isTextBased()) {
            return interaction.reply({
                content: "❌ Target channel must be a text channel.",
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
            content: "✅ Sent successfully as embed!",
            ephemeral: true
        });
    }
};
