const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const InviteData = require('../models/InviteData');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Clean invite tracker and leaderboard system')
        .addSubcommand(s => s.setName('check').setDescription('Check invites for a member').addUserOption(o => o.setName('user').setDescription('Target user')))
        .addSubcommand(s => s.setName('leaderboard').setDescription('View top 10 invite leaderboard')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'check') {
            await interaction.deferReply();
            const target = interaction.options.getUser('user') || interaction.user;
            const data = await InviteData.findOne({ guildId, userId: target.id }) || { regular: 0, leaves: 0, fake: 0 };
            const total = data.regular - data.leaves - data.fake;

            const embed = new EmbedBuilder()
                .setTitle(`📊 Invite Profile: ${target.username}`)
                .setDescription(`**Total Valid Invites:** \`${total}\`\n• Regular Joins: \`${data.regular}\`\n• Leaves: \`${data.leaves}\`\n• Fake/Alt: \`${data.fake}\``)
                .setColor('#57f287')
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'leaderboard') {
            await interaction.deferReply();
            const allData = await InviteData.find({ guildId });
            const sorted = allData
                .map(d => ({ userId: d.userId, total: d.regular - d.leaves - d.fake }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 10);

            if (sorted.length === 0) {
                return interaction.editReply({ content: '❌ No invite data recorded yet.' });
            }

            let desc = '';
            const medals = ['🥇', '🥈', '🥉', '🏅', '🏅', '🏅', '🏅', '🏅', '🏅', '🏅'];
            for (let i = 0; i < sorted.length; i++) {
                desc += `${medals[i]} **#${i + 1}** <@${sorted.userId}> • **${sorted.total}** Invites\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle('🏆 Top 10 Server Invite Leaderboard')
                .setDescription(desc)
                .setColor('#fee75c')
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    }
};
