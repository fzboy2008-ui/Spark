const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");

const activeGiveaways = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Start an interactive community giveaway")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(o => o.setName("channel").setDescription("Target channel for the giveaway").setRequired(true))
        .addStringOption(o => o.setName("reward").setDescription("Prize or reward description").setRequired(true))
        .addIntegerOption(o => o.setName("winners").setDescription("Number of winners").setRequired(true))
        .addStringOption(o => o.setName("time").setDescription("Duration (e.g., 30s, 10m, 2h, 1d)").setRequired(true)),

    async execute(interaction) {
        try {
            const channel = interaction.options.getChannel("channel");
            const reward = interaction.options.getString("reward");
            const winners = interaction.options.getInteger("winners");
            const time = interaction.options.getString("time");

            const ms = parseTime(time);
            const endTime = Date.now() + ms;

            const embed = new EmbedBuilder()
                .setColor("Gold")
                .setTitle("<a:gift:1531251179235840051> COMMUNITY GIVEAWAY STARTED <a:gift:1531251179235840051>")
                .setDescription(`
⟢ Hosted By    : ${interaction.user}
⟢ Reward       : ${reward}
⟢ Winners      : ${winners}
⟢ Ends         : <t:${Math.floor(endTime / 1000)}:R>

────────────────────

➥ React with <a:party_popper:1531251098738888734> to enter the giveaway!
`);

            const msg = await channel.send({ embeds: [embed] });
            await msg.react("1531251098738888734");

            activeGiveaways.set(msg.id, {
                channelId: channel.id,
                reward,
                winners,
                endTime
            });

            setTimeout(() => {
                endGiveaway(msg.id, interaction.client);
            }, ms);

            return interaction.reply({ content: "✅ Giveaway has been successfully started!", ephemeral: true });
        } catch (err) {
            console.error(err);
            return interaction.reply({ content: "❌ An error occurred while starting the giveaway.", ephemeral: true });
        }
    }
};

async function endGiveaway(messageId, client) {
    const giveaway = activeGiveaways.get(messageId);
    if (!giveaway) return;

    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel) return;

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return;

    const reaction = message.reactions.cache.get("1531251098738888734");
    if (!reaction) {
        activeGiveaways.delete(messageId);
        return;
    }

    const reactedUsers = await reaction.users.fetch({ limit: 100 });
    const users = [...reactedUsers.values()].filter(user => !user.bot);
    let winnersList = [];

    for (let i = 0; i < giveaway.winners; i++) {
        if (users.length === 0) break;
        const index = Math.floor(Math.random() * users.length);
        winnersList.push(`<@${users[index].id}>`);
        users.splice(index, 1);
    }

    const embed = new EmbedBuilder()
        .setColor("DarkRed")
        .setTitle("<a:gift:1531251179235840051> GIVEAWAY CONCLUDED <a:gift:1531251179235840051>")
        .setDescription(`
⟢ Reward       : ${giveaway.reward}
⟢ Total Winners: ${giveaway.winners}

────────────────────

<a:trophy:1531251182713045023> **WINNERS**
${winnersList.length ? winnersList.map(u => `▸ ${u}`).join("\n") : "▸ No valid entries recorded"}

────────────────────

<a:celebration:1531251175721009242> Congratulations to all the winners!
`);

    await channel.send({ embeds: [embed] });
    await message.delete().catch(() => null);
    activeGiveaways.delete(messageId);
}

function parseTime(t) {
    if (!t || typeof t !== "string") return 60000;
    if (!isNaN(t)) return parseInt(t) * 1000;

    const num = parseInt(t);
    if (isNaN(num)) return 60000;

    if (t.includes("m")) return num * 60000;
    if (t.includes("h")) return num * 3600000;
    if (t.includes("d")) return num * 86400000;
    if (t.includes("s")) return num * 1000;
    return 60000;
}
