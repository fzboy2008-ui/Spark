const mongoose = require('mongoose');
const { EmbedBuilder } = require('discord.js');
const { GuildConfig, StaffAppSession } = require('../models/GuildConfig');
const { InviteData } = require('../models/InviteData');
const Parser = require('rss-parser');
const parser = new Parser();

module.exports = (client, OWNER_ID, commandsArray) => {
    client.once('ready', async () => {
        console.log(`🔥 ${client.user.tag} online and operational!`);
        if (process.env.MONGO_URI) {
            try { await mongoose.connect(process.env.MONGO_URI); } catch (err) { console.error("Database Connection Error:", err); }
        }

        // Send Boot DM to Owner
        try {
            const owner = await client.users.fetch(OWNER_ID).catch(() => null);
            if (owner) {
                const bootEmbed = new EmbedBuilder()
                    .setTitle('<a:flame:1531251059362631881> BOT STARTED SUCCESSFULLY')
                    .setDescription(`Connected and active across **${client.guilds.cache.size}** servers.\nType \`!bot panel\` or \`!panel\` here in DMs to manage connected servers.`)
                    .setColor('#00FFCC')
                    .setTimestamp();
                await owner.send({ embeds: [bootEmbed] });
            }
        } catch (e) {
            console.error("Could not send owner boot notification:", e);
        }

        // Cache active guild invites on boot
        client.guilds.cache.forEach(async (guild) => {
            try {
                const invites = await guild.invites.fetch();
                const codeUses = new Map();
                invites.forEach(inv => codeUses.set(inv.code, inv.uses));
                client.guildInvites.set(guild.id, codeUses);
            } catch (e) {}
        });

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        try { await rest.put(Routes.applicationCommands(client.user.id), { body: commandsArray }); } catch (e) { console.error("Slash Registration Error:", e); }
    });

    // Message & Owner DM Interceptor
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        if (!message.guild && message.author.id === OWNER_ID) {
            const text = message.content.trim();
            if (text === '!bot panel' || text === '!panel') {
                const guilds = client.guilds.cache.map(g => ({ label: g.name.substring(0, 25), value: g.id }));
                if (guilds.length === 0) return message.reply('❌ The bot is currently not in any servers.');

                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('dm_select_server_bot').setPlaceholder('Select a server to manage...').addOptions(guilds.slice(0, 25))
                );

                const leaveRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('dm_leave_server_btn').setLabel('Leave Selected Server').setStyle(ButtonStyle.Danger)
                );

                const panelEmbed = new EmbedBuilder()
                    .setTitle('<a:owner_crown:1531251021936984064> BOT MANAGEMENT TERMINAL')
                    .setDescription('Select a connected server from the dropdown menu below to manage or leave it.')
                    .setColor('#5865F2');

                return message.reply({ embeds: [panelEmbed], components: [row, leaveRow] });
            }
            return;
        }

        if (!message.guild) return;

        // Staff Application Q&A Handler
        const activeSession = await StaffAppSession.findOne({ userId: message.author.id, guildId: message.guild.id });
        if (activeSession && message.channel.id === activeSession.channelId) {
            activeSession.answers.push(message.content);
            activeSession.currentQuestionIndex += 1;
            await message.delete().catch(() => {});

            const config = await GuildConfig.findOne({ guildId: message.guild.id });
            const questions = config?.appQuestions || [];

            if (activeSession.currentQuestionIndex < questions.length) {
                const nextQ = questions[activeSession.currentQuestionIndex];
                await message.channel.send({ content: `${message.author}, **Question ${activeSession.currentQuestionIndex + 1}:** ${nextQ}` });
                await activeSession.save();
            } else {
                await StaffAppSession.deleteOne({ _id: activeSession._id });
                await message.channel.send({ content: `<a:confirm:153125116167643206> **Application Submitted Successfully!** Please ensure your DMs are open.` });

                const staffChan = message.guild.channels.cache.get(config.appStaffChannelId);
                if (staffChan) {
                    const embed = new EmbedBuilder()
                        .setTitle('<a:announcement:1531251217525768324> NEW STAFF APPLICATION SUBMITTED')
                        .setColor('#00FFCC')
                        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                        .addFields({ name: '👤 Applicant Details', value: `${message.author} (\`${message.author.id}\`)`, inline: false });

                    questions.forEach((q, idx) => {
                        embed.addFields({ name: `Q${idx + 1}: ${q}`, value: activeSession.answers[idx] || 'No response provided', inline: false });
                    });

                    const evalRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`app_approve_${message.author.id}`).setLabel('Approve').setEmoji('<a:confirm:153125116167643206>').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`app_reject_${message.author.id}`).setLabel('Reject').setEmoji('<a:alert:1531250980199338064>').setStyle(ButtonStyle.Danger)
                    );

                    await staffChan.send({ embeds: [embed], components: [evalRow] });
                }

                setTimeout(() => message.channel.delete().catch(() => {}), 5000);
            }
            return;
        }

        // Auto Responses Handler
        const userMessage = message.content.toLowerCase();
        try {
            const config = await GuildConfig.findOne({ guildId: message.guild.id });
            if (!config || !config.autoResponses || config.autoResponses.length === 0) return;

            const matched = config.autoResponses.find(r => new RegExp(`\\b${r.trigger}\\b`, 'i').test(userMessage));
            if (matched && matched.replyText) {
                let replyText = matched.replyText.replace(/\\n/g, '\n');
                const responseEmbed = new EmbedBuilder().setColor("Blue").setTimestamp();
                if (replyText.length > 0) responseEmbed.setDescription(replyText);
                return message.reply({ embeds: [responseEmbed] });
            }
        } catch (err) { console.error("Auto response exception:", err); }
    });

    // Guild Member Add / Remove Invite Tracking
    client.on('guildMemberAdd', async (member) => {
        try {
            const config = await GuildConfig.findOne({ guildId: member.guild.id });
            if (config && config.welcomeChannel) {
                const channel = member.guild.channels.cache.get(config.welcomeChannel);
                if (channel) {
                    let descText = (config.welcomeMessage || 'Welcome to the server!').replace(/{user}/g, `${member}`).replace(/{memberCount}/g, `${member.guild.memberCount}`);
                    const embed = new EmbedBuilder()
                        .setTitle(config.welcomeTitle || '<a:welcome:1531251234147794964> WELCOME TO THE SERVER <a:welcome:1531251234147794964>')
                        .setDescription(descText)
                        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                        .setColor('#FFCC00')
                        .setTimestamp();
                    await channel.send({ content: `${member}`, embeds: [embed] }).catch(() => null);
                }
            }
        } catch (err) { console.error(err); }
    });
};
                  
