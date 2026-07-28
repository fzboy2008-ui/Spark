require('dotenv').config(); 
const { Client, GatewayIntentBits, Collection, REST, Routes, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const { GuildConfig, StaffAppSession } = require('./models/GuildConfig');
const { GuildStore, OrderTicket } = require('./models/GuildStore');
const InviteData = require('./models/InviteData');

const parser = new Parser();
const guildInvites = new Map(); // Global invite cache memory

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.DirectMessages
    ]
});

const OWNER_ID = "1266728371719508062";

client.commands = new Collection();
const commandsArray = [];
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(path.join(__dirname, 'commands', file));
    client.commands.set(command.data.name, command);
    commandsArray.push(command.data.toJSON());
}

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
        console.error("Could not send owner DM on boot:", e);
    }

    // Cache active guild invites on boot
    client.guilds.cache.forEach(async (guild) => {
        try {
            const invites = await guild.invites.fetch();
            const codeUses = new Map();
            invites.forEach(inv => codeUses.set(inv.code, inv.uses));
            guildInvites.set(guild.id, codeUses);
        } catch (e) {}
    });

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commandsArray }); } catch (e) { console.error("Slash Reg Error:", e); }
});

// ================= MESSAGE & OWNER DM INTERCEPTOR =================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 1. Owner DM Panel Handler (!bot panel / !panel)
    if (!message.guild && message.author.id === OWNER_ID) {
        const text = message.content.trim();

        if (text === '!bot panel' || text === '!panel') {
            const guilds = client.guilds.cache.map(g => ({ label: g.name.substring(0, 25), value: g.id }));
            if (guilds.length === 0) return message.reply('❌ The bot is currently not in any servers.');

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('dm_select_server_bot')
                    .setPlaceholder('Select a server to manage...')
                    .addOptions(guilds.slice(0, 25))
            );

            const leaveRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('dm_leave_server_btn')
                    .setLabel('Leave Selected Server')
                    .setStyle(ButtonStyle.Danger)
            );

            const panelEmbed = new EmbedBuilder()
                .setTitle('<a:owner_crown:1531251021936984064> BOT MANAGEMENT TERMINAL')
                .setDescription('Select a connected server from the dropdown menu below to manage or leave it.')
                .setColor('#5865F2');

            return message.reply({ 
                embeds: [panelEmbed], 
                components: [row, leaveRow] 
            });
        }
        return;
    }

    if (!message.guild) return;

    // 2. Staff Application Session Q&A Handler
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
            await message.channel.send({ content: `<a:confirm:153125116167643206> **Application Submitted Successfully!** Please make sure your Direct Messages (DMs) are open so you can receive updates. This channel will close in 5 seconds.` });

            const staffChan = message.guild.channels.cache.get(config.appStaffChannelId);
            if (staffChan) {
                const embed = new EmbedBuilder()
                    .setTitle('<a:announcement:1531251217525768324> NEW STAFF APPLICATION SUBMITTED')
                    .setColor('#00FFCC')
                    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: '👤 Applicant Details', value: `${message.author} (\`${message.author.id}\`)`, inline: false }
                    );

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

    // 3. Server Auto Responses Handler
    const userMessage = message.content.toLowerCase();

    try {
        const config = await GuildConfig.findOne({ guildId: message.guild.id });
        if (!config || !config.autoResponses || config.autoResponses.length === 0) return;

        const matched = config.autoResponses.find(r => {
            const regex = new RegExp(`\\b${r.trigger}\\b`, 'i');
            return regex.test(userMessage);
        });
        
        if (matched && matched.replyText) {
            let replyText = matched.replyText.replace(/\\n/g, '\n');
            const responseEmbed = new EmbedBuilder().setColor("Blue").setTimestamp();

            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const foundUrls = replyText.match(urlRegex);

            if (foundUrls && foundUrls.length > 0) {
                const imageUrl = foundUrls.find(url => url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || url.includes('cdn.discordapp.com') || url.includes('media.discordapp.net'));
                if (imageUrl) {
                    responseEmbed.setImage(imageUrl);
                    replyText = replyText.replace(imageUrl, '').trim();
                }
            }

            if (replyText.length > 0) responseEmbed.setDescription(replyText);
            return message.reply({ embeds: [responseEmbed] });
        }
    } catch (err) { console.error("Auto response exception:", err); }
});

// ================= WELCOME & INVITE TRACKER JOIN =================
client.on('guildMemberAdd', async (member) => {
    try {
        const config = await GuildConfig.findOne({ guildId: member.guild.id });
        if (config && config.welcomeChannel) {
            const channel = member.guild.channels.cache.get(config.welcomeChannel);
            if (channel) {
                let descText = config.welcomeMessage || 'Welcome to the server!';
                descText = descText
                    .replace(/{user}/g, `${member}`)
                    .replace(/{{User.Mention}}/g, `${member}`)
                    .replace(/{{user.mention}}/g, `${member}`)
                    .replace(/{memberCount}/g, `${member.guild.memberCount}`);
                
                const createdAtFormatted = member.user.createdAt.toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'long', year: 'numeric'
                });
                descText = descText.replace(/{accountCreated}/g, createdAtFormatted);
                
                const embed = new EmbedBuilder()
                    .setTitle(config.welcomeTitle || '<a:welcome:1531251234147794964> WELCOME TO THE SERVER <a:welcome:1531251234147794964>')
                    .setDescription(descText)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                    .setColor('#FFCC00')
                    .setFooter({ text: `Member #${member.guild.memberCount}` })
                    .setTimestamp();
                
                if (config.welcomeThumbnail && config.welcomeThumbnail.startsWith('http')) {
                    embed.setImage(config.welcomeThumbnail);
                }
                await channel.send({ content: `${member}`, embeds: [embed] }).catch(() => null);
            }
        }
        if (config && config.totalMembersChan) {
            const chan = member.guild.channels.cache.get(config.totalMembersChan);
            if (chan) await chan.setName(`🪐 Total Members: ${member.guild.memberCount}`).catch(() => null);
        }

        const cachedInvites = guildInvites.get(member.guild.id) || new Map();
        const newInvites = await member.guild.invites.fetch().catch(() => null);
        
        let inviter = null;
        if (newInvites) {
            const usedInvite = newInvites.find(inv => cachedInvites.get(inv.code) < inv.uses);
            if (usedInvite && usedInvite.inviter) inviter = usedInvite.inviter;

            const codeUses = new Map();
            newInvites.forEach(inv => codeUses.set(inv.code, inv.uses));
            guildInvites.set(member.guild.id, codeUses);
        }

        if (inviter) {
            const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
            const isFake = accountAgeDays < 7;

            const invData = await InviteData.findOne({ guildId: member.guild.id, userId: inviter.id }) || new InviteData({ guildId: member.guild.id, userId: inviter.id });

            if (isFake) invData.permFake += 1;
            else invData.permRegular += 1;

            await invData.save();

            if (config && config.inviteLogChannel) {
                const logChan = member.guild.channels.cache.get(config.inviteLogChannel);
                if (logChan) {
                    const lifetimeTotal = invData.permRegular - invData.permLeaves - invData.permFake;
                    const logCard = `👤 Joined Member : ${member.user.tag}\n🔗 Invited By   : ${inviter.tag}\n--------------------------------\n📊 Lifetime Stats: ${lifetimeTotal} Total (${invData.permRegular} Reg | ${invData.permLeaves} Leaves)`;
                    const embed = new EmbedBuilder().setTitle('📥 MEMBER JOIN LOG').setDescription(logCard).setColor('#00FF00').setTimestamp();
                    await logChan.send({ embeds: [embed] }).catch(() => null);
                }
            }
        }
    } catch (err) { console.error(err); }
});

client.on('guildMemberRemove', async (member) => {
    try {
        const config = await GuildConfig.findOne({ guildId: member.guild.id });
        if (config && config.totalMembersChan) {
            const chan = member.guild.channels.cache.get(config.totalMembersChan);
            if (chan) await chan.setName(`🪐 Total Members: ${member.guild.memberCount}`).catch(() => null);
        }
    } catch (err) { console.error(err); }
});

// ================= DYNAMIC INTERACTIONS (ROUTER) =================
client.on('interactionCreate', async (interaction) => {
    try {
        // Owner DM Panel Selections & Buttons
        if (!interaction.guild && interaction.user.id === OWNER_ID) {
            if (interaction.isStringSelectMenu() && interaction.customId === 'dm_select_server_bot') {
                const selectedGuildId = interaction.values[0];
                const guild = client.guilds.cache.get(selectedGuildId);
                if (!guild) return interaction.reply({ content: '❌ Guild not found.', ephemeral: true });

                return interaction.update({ 
                    content: `✅ Selected Server: **${guild.name}**\nClick below to leave this server if needed:`, 
                    components: [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`confirm_leave_${selectedGuildId}`)
                                .setLabel(`Leave ${guild.name}`)
                                .setStyle(ButtonStyle.Danger)
                        )
                    ] 
                });
            }

            if (interaction.isButton() && interaction.customId.startsWith('confirm_leave_')) {
                const guildId = interaction.customId.split('_')[2];
                const guild = client.guilds.cache.get(guildId);
                if (guild) {
                    const name = guild.name;
                    await guild.leave();
                    return interaction.update({ content: `✅ Successfully left server: **${name}**`, components: [] });
                }
                return interaction.update({ content: `❌ Server could not be found.`, components: [] });
            }
            return;
        }

        const guildId = interaction.guild?.id;
        if (!guildId) return;

        // 1. SLASH COMMANDS
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (command) await command.execute(interaction);
            return;
        }

        // 2. BUTTON INTERACTIONS
        if (interaction.isButton()) {
            if (interaction.customId === 'btn_inv_guild_lb') {
                await interaction.deferReply();
                const fetchedInvites = await interaction.guild.invites.fetch().catch(() => null);
                
                let inviteMap = new Map();
                if (fetchedInvites) {
                    fetchedInvites.forEach(inv => {
                        if (inv.inviter) {
                            const prev = inviteMap.get(inv.inviter.id) || 0;
                            inviteMap.set(inv.inviter.id, prev + inv.uses);
                        }
                    });
                }

                const dbData = await InviteData.find({ guildId });
                dbData.forEach(d => {
                    const dbTotal = d.permRegular - d.permLeaves - d.permFake;
                    const inviterUses = inviteMap.get(d.userId) || 0;
                    inviteMap.set(d.userId, Math.max(dbTotal, inviterUses));
                });

                const sorted = Array.from(inviteMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

                if (sorted.length === 0) {
                    return await interaction.followUp({ content: '❌ No active invite statistics found in this server.' });
                }

                let str = '```text\n';
                const medals = ['🥇', '🥈', '🥉', '🎖️', '🎖️', '🎖️', '🎖️', '🎖️', '🎖️', '🎖️'];
                for (let i = 0; i < sorted.length; i++) {
                    const u = await interaction.client.users.fetch(sorted[i][0]).catch(() => null);
                    str += `${medals[i]} ${i+1}. ${(u ? u.username : 'Unknown').padEnd(12, ' ')} • ${sorted[i][1]} Invites\n`;
                }
                str += '```';

                const embed = new EmbedBuilder().setTitle('<a:trophy:1531251182713045023> TOP 10 LIFETIME INVITES LEADERBOARD').setDescription(str).setColor('#00FF00');
                return await interaction.followUp({ embeds: [embed] });
            }

            if (interaction.customId === 'btn_inv_logs_cfg') {
                const modal = new ModalBuilder().setCustomId('modal_inv_logs').setTitle('Setup Invite Log Channel');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inv_log_input').setLabel('Invite Log Channel ID').setRequired(true).setStyle(TextInputStyle.Short)));
                return await interaction.showModal(modal);
            }

            // Staff Application Setup Buttons
            if (interaction.customId === 'setup_app_config') {
                const store = await GuildConfig.findOne({ guildId });
                const modal = new ModalBuilder().setCustomId('modal_app_config').setTitle('Configure Staff Application');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_staff_chan').setLabel('Staff Review Channel ID').setRequired(true).setStyle(TextInputStyle.Short).setValue(store?.appStaffChannelId || '')),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_role').setLabel('Staff Role ID (for ping/perms)').setRequired(true).setStyle(TextInputStyle.Short).setValue(store?.appStaffRoleId || '')),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_qs').setLabel('Questions (Separated by ||)').setRequired(true).setStyle(TextInputStyle.Paragraph).setValue(store?.appQuestions?.join(' || ') || '')),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_dm_app').setLabel('Approval DM Message').setRequired(true).setStyle(TextInputStyle.Paragraph).setValue(store?.appDmApproved || '')),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_dm_rej').setLabel('Rejection DM Message').setRequired(true).setStyle(TextInputStyle.Paragraph).setValue(store?.appDmRejected || ''))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'deploy_app_panel') {
                const modal = new ModalBuilder().setCustomId('modal_deploy_app').setTitle('Deploy Application Panel');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_target_chan').setLabel('Target Channel ID to send Panel').setRequired(true).setStyle(TextInputStyle.Short)));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_start_staff_apply') {
                const config = await GuildConfig.findOne({ guildId });
                if (!config || !config.appStaffChannelId) {
                    return await interaction.reply({ content: '❌ The staff application system has not been fully configured by administrators yet.', ephemeral: true });
                }

                const existingSession = await StaffAppSession.findOne({ userId: interaction.user.id, guildId });
                if (existingSession) {
                    return await interaction.reply({ content: '⚠️ You already have an active application session running in <#' + existingSession.channelId + '>', ephemeral: true });
                }

                const appChannel = await interaction.guild.channels.create({
                    name: `app-${interaction.user.username}`,
                    parent: config.ticketParent || null,
                    permissionOverwrites: [
                        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                    ]
                });

                await StaffAppSession.create({
                    userId: interaction.user.id,
                    guildId,
                    channelId: appChannel.id,
                    currentQuestionIndex: 0,
                    answers: []
                });

                const firstQ = config.appQuestions[0] || 'What is your full name and age?';
                await appChannel.send({ content: `${interaction.user}\n\n📝 **Staff Application Process Started!**\n**Question 1:** ${firstQ}` });
                return await interaction.reply({ content: `✅ Application channel successfully created: ${appChannel}`, ephemeral: true });
            }

            // Approve/Reject Staff Application Buttons
            if (interaction.customId.startsWith('app_approve_') || interaction.customId.startsWith('app_reject_')) {
                const isApprove = interaction.customId.startsWith('app_approve_');
                const targetUserId = interaction.customId.replace(isApprove ? 'app_approve_' : 'app_reject_', '');
                
                const config = await GuildConfig.findOne({ guildId });
                const targetUser = await client.users.fetch(targetUserId).catch(() => null);

                if (targetUser) {
                    const msgTemplate = isApprove ? (config?.appDmApproved || 'Your application was approved!') : (config?.appDmRejected || 'Your application was rejected.');
                    const finalMsg = msgTemplate.replace(/{{server}}/g, interaction.guild.name);
                    
                    const dmEmbed = new EmbedBuilder()
                        .setTitle(isApprove ? '<a:confirm:153125116167643206> APPLICATION APPROVED' : '<a:alert:1531250980199338064> APPLICATION DECLINED')
                        .setDescription(finalMsg)
                        .setColor(isApprove ? '#00FF00' : '#FF0000')
                        .setTimestamp();

                    await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});
                }

                const resultEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(isApprove ? '#00FF00' : '#FF0000')
                    .addFields({ name: '⚡ Status Update', value: isApprove ? `✅ Approved by ${interaction.user.tag}` : `❌ Rejected by ${interaction.user.tag}`, inline: false });

                await interaction.update({ embeds: [resultEmbed], components: [] });
                return;
            }

            if (interaction.customId === 'setup_store_cfg') {
                const modal = new ModalBuilder().setCustomId('modal_store_cfg').setTitle('1. Basic Setup & Stock');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cfg_name').setLabel('Server Name').setRequired(true).setStyle(TextInputStyle.Short).setPlaceholder('e.g., Community Network')),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cfg_role').setLabel('Admin Role ID').setRequired(true).setStyle(TextInputStyle.Short).setPlaceholder('e.g., 123456789012345678')),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cfg_logs').setLabel('Logs Channel ID').setRequired(true).setStyle(TextInputStyle.Short).setPlaceholder('e.g., 123456789012345678')),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cfg_items').setLabel('Items & Stock Setup').setRequired(true).setStyle(TextInputStyle.Paragraph).setPlaceholder('Ranks:Elite-100 || Keys:Shine Key-50'))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_store_visual') {
                const modal = new ModalBuilder().setCustomId('modal_store_visual').setTitle('2. Visual Panel Deploy');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pnl_title').setLabel('Embed Header Title').setRequired(true).setStyle(TextInputStyle.Short).setValue('🛒 SERVER STOREFRONT')),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pnl_desc').setLabel('Embed Description Text').setRequired(true).setStyle(TextInputStyle.Paragraph).setValue('Select a category below to view items.')),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pnl_banner').setLabel('Banner Image CDN Link').setRequired(false).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pnl_chan').setLabel('Target Channel ID').setRequired(true).setStyle(TextInputStyle.Short))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_store_execution') {
                const modal = new ModalBuilder().setCustomId('modal_store_execution').setTitle('3. Console & Commands');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('exe_console').setLabel('Console Channel ID').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('exe_cmds').setLabel('Command Mappings').setRequired(true).setStyle(TextInputStyle.Paragraph).setPlaceholder('Elite:lp user {name} parent set elite || Shine Key:givekey {name} shine 1'))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_store_dms') {
                const store = await GuildStore.findOne({ guildId });
                const modal = new ModalBuilder().setCustomId('modal_store_dms').setTitle('4. DM Alert Templates');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dm_app').setLabel('Approved DM Text').setRequired(true).setStyle(TextInputStyle.Paragraph).setValue(store?.dmApproved || "Your order for **{{item}}** at **{{server}}** has been approved and processed successfully!")),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dm_rej').setLabel('Rejected DM Text').setRequired(true).setStyle(TextInputStyle.Paragraph).setValue(store?.dmRejected || "Unfortunately, your order for **{{item}}** at **{{server}}** has been declined.")),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dm_pend').setLabel('Pending Reminder DM Text').setRequired(true).setStyle(TextInputStyle.Paragraph).setValue(store?.dmPendingReminder || "This is a reminder that your order for **{{item}}** at **{{server}}** is currently pending review."))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_stats_btn') {
                const modal = new ModalBuilder().setCustomId('modal_stats_setup').setTitle('📊 Server Stats Setup');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stats_total_input').setLabel('Total Members Voice ID').setRequired(true).setStyle(TextInputStyle.Short))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_youtube_btn') {
                const modal = new ModalBuilder().setCustomId('youtube_modal_submit').setTitle('📺 YouTube System Setup');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('yt_channel_id_input').setLabel('YouTube Channel ID').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('yt_live_chan_input').setLabel('Live Alert Channel ID').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('yt_upload_chan_input').setLabel('Upload Alert Channel ID').setRequired(true).setStyle(TextInputStyle.Short))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_welcome_btn') {
                const modal = new ModalBuilder().setCustomId('modal_welcome').setTitle('Welcome Configuration');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_title').setLabel('Embed Title').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_msg').setLabel('Welcome Message').setRequired(true).setStyle(TextInputStyle.Paragraph)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_chan').setLabel('Welcome Channel ID').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_thumb').setLabel('Banner Image URL').setRequired(false).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_dm').setLabel('DM Text').setRequired(false).setStyle(TextInputStyle.Paragraph))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_tickets_btn' || interaction.customId === 'setup_ticket_btn') {
                const modal = new ModalBuilder().setCustomId('modal_ticket').setTitle('Advanced Ticket Setup');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_desc').setLabel('Description || Banner URL').setRequired(true).setStyle(TextInputStyle.Paragraph)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_cats').setLabel('Categories (Comma separated)').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_parent').setLabel('Category ID').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_logs').setLabel('LOGS_ID, STAFF_ROLE_ID').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_msg').setLabel('Initial Ticket Message').setRequired(true).setStyle(TextInputStyle.Paragraph))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_auto_btn') {
                const modal = new ModalBuilder().setCustomId('modal_auto_response').setTitle('💬 Auto Response Core');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('auto_input_box')
                            .setLabel('Format: trigger:reply || trigger:reply')
                            .setPlaceholder('e.g., ip:play.network.com || store:visit our store')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Paragraph)
                    )
                );
                return await interaction.showModal(modal);
            }
            
            // --- SUPPORT TICKET CLAIM & RENAME LOGIC ---
            const config = await GuildConfig.findOne({ guildId });
            if (interaction.customId === 'claim_ticket') {
                if (config && config.ticketRole && !interaction.member.roles.cache.has(config.ticketRole)) {
                    return await interaction.reply({ content: '❌ This action is restricted to support staff members.', ephemeral: true });
                }

                if (interaction.channel.name.startsWith('✅-claimed-')) {
                    return await interaction.reply({ content: '⚠️ This support ticket has already been claimed!', ephemeral: true });
                }

                const newName = interaction.channel.name.replace('ticket-', '✅-claimed-');
                await interaction.channel.setName(newName).catch(() => {});

                await interaction.reply({ content: `🔒 Ticket successfully claimed by ${interaction.user}` });

                const newRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claimed').setEmoji('<a:confirm:153125116167643206>').setStyle(ButtonStyle.Success).setDisabled(true),
                    new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setEmoji('<a:alert:1531250980199338064>').setStyle(ButtonStyle.Danger)
                );
                return await interaction.message.edit({ components: [newRow] });
            }

            if (interaction.customId === 'close_ticket') {
                await interaction.reply('🔒 Closing ticket channel in 5 seconds...');
                const fetched = await interaction.channel.messages.fetch({ limit: 100 });
                let txt = '';
                [...fetched.values()].reverse().forEach(m => { txt += `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content}\n`; });
                const attachment = new AttachmentBuilder(Buffer.from(txt, 'utf-8'), { name: 'transcript.txt' });
                if (config && config.ticketLogs) {
                    const c = interaction.guild.channels.cache.get(config.ticketLogs);
                    if (c) await c.send({ content: `🗑️ Ticket closed by ${interaction.user.tag}`, files: [attachment] }).catch(() => null);
                }
                setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            }

            if (interaction.customId.startsWith('btn_trigger_checkout_')) {
                const itemObjectId = interaction.customId.replace('btn_trigger_checkout_', '');
                const playerModal = new ModalBuilder().setCustomId(`modal_player_checkout_${itemObjectId}`).setTitle('Player Verification');
                playerModal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('player_ign').setLabel('Enter In-Game Username (IGN)').setRequired(true).setStyle(TextInputStyle.Short))
                );
                return await interaction.showModal(playerModal);
            }

            const ticket = await OrderTicket.findOne({ channelId: interaction.channel.id });
            if (ticket) {
                const store = await GuildStore.findOne({ guildId });
                if (interaction.customId === 'btn_order_approve') {
                    await interaction.deferReply();
                    const storeItem = store?.items.find(i => i.name.toLowerCase() === ticket.itemName.toLowerCase());
                    if (store?.consoleChannelId && storeItem && storeItem.command) {
                        const consoleChan = interaction.guild.channels.cache.get(store.consoleChannelId);
                        if (consoleChan) {
                            const finalCmd = storeItem.command.replace(/{name}/g, ticket.buyerIGN);
                            await consoleChan.send({ content: finalCmd });
                        }
                    }
                    const buyer = await interaction.client.users.fetch(ticket.buyerId).catch(() => null);
                    if (buyer) {
                        const msgTemplate = (store?.dmApproved || "Your order for **{{item}}** at **{{server}}** has been approved and processed successfully!");
                        const msg = msgTemplate.replace(/{{server}}/g, store?.serverName || "Server").replace(/{{item}}/g, ticket.itemName);
                        
                        const approveEmbed = new EmbedBuilder()
                            .setTitle('<a:confirm:153125116167643206> ORDER APPROVED')
                            .setDescription(msg)
                            .setColor('#00FF00')
                            .setTimestamp();
                        await buyer.send({ embeds: [approveEmbed] }).catch(() => null);
                    }
                    await interaction.editReply({ content: '✅ **Order Approved!** Console command executed.' });
                    return await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_order_delete').setLabel('Delete Room').setStyle(ButtonStyle.Secondary))] });
                }

                if (interaction.customId === 'btn_order_reject') {
                    await interaction.deferReply();
                    const buyer = await interaction.client.users.fetch(ticket.buyerId).catch(() => null);
                    if (buyer) {
                        const msgTemplate = (store?.dmRejected || "Unfortunately, your order for **{{item}}** at **{{server}}** has been declined.");
                        const msg = msgTemplate.replace(/{{server}}/g, store?.serverName || "Server").replace(/{{item}}/g, ticket.itemName);
                        
                        const rejectEmbed = new EmbedBuilder()
                            .setTitle('<a:alert:1531250980199338064> ORDER REJECTED')
                            .setDescription(msg)
                            .setColor('#FF0000')
                            .setTimestamp();
                        await buyer.send({ embeds: [rejectEmbed] }).catch(() => null);
                    }
                    await interaction.editReply({ content: '🚫 **Order Rejected!** Buyer has been notified.' });
                    return await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_order_delete').setLabel('Delete Room').setStyle(ButtonStyle.Secondary))] });
                }

                if (interaction.customId === 'btn_order_delete') {
                    await interaction.reply({ content: '🗑️ Deleting order channel permanently in 5 seconds...' });
                    await OrderTicket.deleteOne({ channelId: interaction.channel.id });
                    setTimeout(() => interaction.channel.delete().catch(() => null), 5000);
                }
            }
        }

        // 3. MODAL SUBMISSIONS HANDLER
        if (interaction.isModalSubmit()) {
            await interaction.deferReply({ ephemeral: true });

            if (interaction.customId === 'modal_inv_logs') {
                const channelId = interaction.fields.getTextInputValue('inv_log_input').trim();
                await GuildConfig.findOneAndUpdate({ guildId }, { inviteLogChannel: channelId }, { upsert: true });
                return await interaction.editReply({ content: `✅ **Saved Successfully!** Invite log channel updated to <#${channelId}>.` });
            }

            if (interaction.customId === 'modal_app_config') {
                const staffChanId = interaction.fields.getTextInputValue('app_staff_chan').trim();
                const staffRoleId = interaction.fields.getTextInputValue('app_role').trim();
                const qsRaw = interaction.fields.getTextInputValue('app_qs').trim();
                const dmApp = interaction.fields.getTextInputValue('app_dm_app').trim();
                const dmRej = interaction.fields.getTextInputValue('app_dm_rej').trim();

                const questions = qsRaw.split('||').map(q => q.trim()).filter(Boolean);

                await GuildConfig.findOneAndUpdate({ guildId }, {
                    appStaffChannelId: staffChanId,
                    appStaffRoleId: staffRoleId,
                    appQuestions: questions,
                    appDmApproved: dmApp,
                    appDmRejected: dmRej
                }, { upsert: true });

                return await interaction.editReply({ content: '✅ **Staff Application Settings Saved Successfully!**' });
            }

            if (interaction.customId === 'modal_deploy_app') {
                const targetChanId = interaction.fields.getTextInputValue('app_target_chan').trim();
                const targetChan = interaction.guild.channels.cache.get(targetChanId);
                if (!targetChan) return await interaction.editReply({ content: '❌ Invalid channel ID provided.' });

                const embed = new EmbedBuilder()
                    .setTitle('<a:announcement:1531251217525768324> STAFF APPLICATION PANEL')
                    .setDescription('Interested in joining our official staff team? Click the button below to start your application process.')
                    .setColor('#5865F2')
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_start_staff_apply').setLabel('Apply for Staff').setEmoji('<a:welcome:1531251234147794964>').setStyle(ButtonStyle.Primary)
                );

                await targetChan.send({ embeds: [embed], components: [row] });
                return await interaction.editReply({ content: `✅ Successfully deployed the Staff Application panel in <#${targetChanId}>` });
            }

                        if (interaction.customId === 'modal_ticket') {
                const logsData = interaction.fields.getTextInputValue('t_logs').split(',');
                const cats = interaction.fields.getTextInputValue('t_cats').split(',').map(c => c.trim());
                const descData = interaction.fields.getTextInputValue('t_desc').split('||');
                const panelDescription = descData[0]?.trim();
                const panelBanner = descData[1]?.trim() || '';

                await GuildConfig.findOneAndUpdate({ guildId }, {
                    ticketDescription: panelDescription,
                    ticketBanner: panelBanner,
                    ticketParent: interaction.fields.getTextInputValue('t_parent'),
                    ticketLogs: logsData[0]?.trim(),
                    ticketRole: logsData[1]?.trim(),
                    ticketMessage: interaction.fields.getTextInputValue('t_msg').trim()
                }, { upsert: true, new: true });

                const embed = new EmbedBuilder().setTitle('🎫 Create a Ticket').setDescription(panelDescription).setColor('#5865F2');
                if (panelBanner && panelBanner.startsWith('http')) embed.setImage(panelBanner);

                const options = cats.map(cat => ({ 
                    label: cat, 
                    value: cat.toLowerCase().replace(/\s+/g, '_') 
                }));
                
                const menu = new StringSelectMenuBuilder()
                    .setCustomId('ticket_select')
                    .setPlaceholder('Select a ticket category...')
                    .addOptions(options);

                await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
                return await interaction.editReply({ content: '✅ Support Tickets Panel deployed successfully!' });
            }

            if (interaction.customId === 'modal_stats_setup') {
                const tId = interaction.fields.getTextInputValue('stats_total_input').trim();
                await GuildConfig.findOneAndUpdate({ guildId }, { totalMembersChan: tId }, { upsert: true });
                return await interaction.editReply({ content: '✅ **Member Stats Voice Channel configured successfully!**' });
            }

            if (interaction.customId === 'youtube_modal_submit') {
                const ytId = interaction.fields.getTextInputValue('yt_channel_id_input').trim();
                const lId = interaction.fields.getTextInputValue('yt_live_chan_input').trim();
                const uId = interaction.fields.getTextInputValue('yt_upload_chan_input').trim();
                await GuildConfig.findOneAndUpdate({ guildId }, { ytChannelId: ytId, ytLiveChannel: lId, ytUploadChannel: uId }, { upsert: true });
                return await interaction.editReply({ content: '✅ **YouTube System connected successfully!** Alerts are now active.' });
            }

            if (interaction.customId === 'modal_welcome') {
                await GuildConfig.findOneAndUpdate({ guildId }, {
                    welcomeTitle: interaction.fields.getTextInputValue('w_title'),
                    welcomeMessage: interaction.fields.getTextInputValue('w_msg'),
                    welcomeChannel: interaction.fields.getTextInputValue('w_chan'),
                    welcomeThumbnail: interaction.fields.getTextInputValue('w_thumb') || '',
                    welcomeDm: interaction.fields.getTextInputValue('w_dm') || ''
                }, { upsert: true });
                return await interaction.editReply({ content: '✅ Welcome configuration saved successfully!' });
            }

            if (interaction.customId === 'modal_store_cfg') {
                const serverName = interaction.fields.getTextInputValue('cfg_name');
                const adminRoleId = interaction.fields.getTextInputValue('cfg_role');
                const logsChannelId = interaction.fields.getTextInputValue('cfg_logs');
                const bulkInput = interaction.fields.getTextInputValue('cfg_items');

                const categories = [];
                const items = [];

                if (bulkInput) {
                    const categoryBlocks = bulkInput.split('||');
                    categoryBlocks.forEach(block => {
                        const parts = block.split(':');
                        if (parts.length < 2) return;
                        const catName = parts[0].trim();
                        const itemsRaw = parts[1].split(',');
                        if (!categories.includes(catName) && catName) categories.push(catName);
                        itemsRaw.forEach(iRaw => {
                            const itemParts = iRaw.split('-');
                            if (itemParts.length < 2) return;
                            const iName = itemParts[0].trim();
                            const iPrice = parseInt(itemParts[1].replace(/[^0-9]/g, ''), 10);
                            if (iName && !isNaN(iPrice)) {
                                items.push({ category: catName, name: iName, price: iPrice, command: '' });
                            }
                        });
                    });
                }

                await GuildStore.findOneAndUpdate({ guildId }, { serverName, adminRoleId, logsChannelId, categories, items }, { upsert: true });
                return await interaction.editReply({ content: '✅ **Stock & Categories updated successfully!**' });
            }

            if (interaction.customId === 'modal_store_visual') {
                const panelTitle = interaction.fields.getTextInputValue('pnl_title');
                const panelDescription = interaction.fields.getTextInputValue('pnl_desc');
                const panelBanner = interaction.fields.getTextInputValue('pnl_banner');
                const targetChanId = interaction.fields.getTextInputValue('pnl_chan');

                const store = await GuildStore.findOneAndUpdate({ guildId }, { panelTitle, panelDescription, panelBanner }, { upsert: true, new: true });
                const targetChannel = interaction.guild.channels.cache.get(targetChanId);

                if (!targetChannel) return await interaction.editReply({ content: '❌ Invalid target destination channel ID!' });

                const embed = new EmbedBuilder().setTitle(panelTitle).setDescription(panelDescription).setColor('#5865F2').setTimestamp();
                if (panelBanner && panelBanner.startsWith('http')) embed.setImage(panelBanner);

                if (!store.categories || store.categories.length === 0) {
                    return await interaction.editReply({ content: '❌ Please configure the stock items first before deploying the visual panel!' });
                }

                const options = store.categories.map(cat => ({ label: cat, value: `store_cat_${cat}` }));
                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('store_category_select').setPlaceholder('🗂️ Choose a category...').addOptions(options)
                );

                await targetChannel.send({ embeds: [embed], components: [row] });
                return await interaction.editReply({ content: `🚀 **Storefront deployed successfully** in <#${targetChanId}>.` });
            }

            if (interaction.customId === 'modal_store_execution') {
                const consoleChannelId = interaction.fields.getTextInputValue('exe_console');
                const mappingsRaw = interaction.fields.getTextInputValue('exe_cmds').split('||').map(m => m.trim());

                const store = await GuildStore.findOne({ guildId });
                if (!store) return await interaction.editReply({ content: '❌ Please setup basic stock settings first!' });

                store.consoleChannelId = consoleChannelId;
                mappingsRaw.forEach(mapping => {
                    const parts = mapping.split(':');
                    const iName = parts[0]?.trim();
                    const iCmd = parts[1]?.trim();
                    const matchedItem = store.items.find(i => i.name.toLowerCase() === iName.toLowerCase());
                    if (matchedItem) matchedItem.command = iCmd;
                });

                await store.save();
                return await interaction.editReply({ content: '⚙️ **Console commands mapped successfully!**' });
            }

            if (interaction.customId === 'modal_store_dms') {
                const dmApproved = interaction.fields.getTextInputValue('dm_app');
                const dmRejected = interaction.fields.getTextInputValue('dm_rej');
                const dmPendingReminder = interaction.fields.getTextInputValue('dm_pend');

                await GuildStore.findOneAndUpdate({ guildId }, { dmApproved, dmRejected, dmPendingReminder }, { upsert: true });
                return await interaction.editReply({ content: '✅ **Custom DM alert templates saved successfully!**' });
            }

            if (interaction.customId === 'modal_auto_response') {
                const bulkInput = interaction.fields.getTextInputValue('auto_input_box');
                const autoResponses = [];
                if (bulkInput && bulkInput.trim().length > 0) {
                    const responseBlocks = bulkInput.split('||');
                    responseBlocks.forEach(block => {
                        const firstColonIndex = block.indexOf(':');
                        if (firstColonIndex === -1) return;
                        const triggerWord = block.substring(0, firstColonIndex).trim().toLowerCase();
                        const replyString = block.substring(firstColonIndex + 1).trim();
                        if (triggerWord && replyString) {
                            autoResponses.push({ trigger: triggerWord, replyText: replyString });
                        }
                    });
                }
                await GuildConfig.findOneAndUpdate({ guildId }, { autoResponses }, { upsert: true });
                return await interaction.editReply({ content: '✅ **Auto-responses configured and set live!**' });
            }

            if (interaction.customId.startsWith('modal_player_checkout_')) {
                const itemUniqueId = interaction.customId.replace('modal_player_checkout_', '');
                const buyerIGN = interaction.fields.getTextInputValue('player_ign');

                const store = await GuildStore.findOne({ guildId });
                const item = store?.items.find(i => i._id.toString() === itemUniqueId);

                if (!item) return await interaction.editReply({ content: '❌ The selected item has expired or been removed.' });

                const ticketRoom = await interaction.guild.channels.create({
                    name: `order-${interaction.user.username}`,
                    permissionOverwrites: [
                        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                        ...(store.adminRoleId ? [{ id: store.adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : [])
                    ]
                });

                await OrderTicket.create({
                    guildId,
                    channelId: ticketRoom.id,
                    buyerId: interaction.user.id,
                    buyerIGN,
                    itemName: item.name,
                    itemPrice: item.price,
                    itemCategory: item.category
                });

                const embed = new EmbedBuilder()
                    .setTitle('<a:store_cart:1531251190275379282> NEW INBOUND ORDER')
                    .setColor('#FFCC00')
                    .addFields(
                        { name: '👤 Buyer Account', value: `${interaction.user}`, inline: true },
                        { name: '🎮 In-Game IGN', value: `\`${buyerIGN}\``, inline: true },
                        { name: '📦 Selected Package', value: `**${item.name}** (${item.category})`, inline: false },
                        { name: '💰 Total Price', value: `\`${item.price} INR\``, inline: true }
                    )
                    .setTimestamp();

                const controlRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_order_approve').setLabel('Approve').setEmoji('<a:confirm:153125116167643206>').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('btn_order_reject').setLabel('Reject').setEmoji('<a:alert:1531250980199338064>').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('btn_order_delete').setLabel('Delete Room').setStyle(ButtonStyle.Secondary)
                );

                await ticketRoom.send({ content: `${interaction.user} | <@&${store.adminRoleId}>`, embeds: [embed], components: [controlRow] });
                return await interaction.editReply({ content: `🎯 Order ticket room successfully opened: ${ticketRoom}` });
            }
        }

        // 4. SELECT MENUS HANDLER
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'ticket_select') {
                const config = await GuildConfig.findOne({ guildId });
                if (!config) return;

                const selectedCategory = interaction.values[0]; 
                const name = `ticket-${interaction.user.username.toLowerCase()}`;
                
                if (interaction.guild.channels.cache.find(c => c.name === name || c.name.startsWith(`✅-claimed-${interaction.user.username.toLowerCase()}`))) {
                    return await interaction.reply({ content: '❌ You already have an active support ticket open.', ephemeral: true });
                }
                
                await interaction.deferReply({ ephemeral: true });
                const ch = await interaction.guild.channels.create({
                    name, parent: config.ticketParent || null,
                    permissionOverwrites: [
                        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                        ...(config.ticketRole ? [{ id: config.ticketRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : [])
                    ]
                });

                let parsedMessage = config.ticketMessage || 'Thank you for contacting support. A staff member will assist you shortly.';
                parsedMessage = parsedMessage.replace(/{user}/g, `${interaction.user}`).replace(/{{User.Mention}}/g, `${interaction.user}`).replace(/{{user.mention}}/g, `${interaction.user}`);
                
                const staffPing = config.ticketRole ? `<@&${config.ticketRole}>` : '';
                const fullPingContent = `${interaction.user} ${staffPing}`; // Pinging outside embed

                const embed = new EmbedBuilder().setTitle('🎫 Support Ticket Terminal').setDescription(parsedMessage).addFields({ name: '🗂️ Category', value: `\`${selectedCategory}\``, inline: false }).setColor('#00ffcc');
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setEmoji('<a:confirm:153125116167643206>').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setEmoji('<a:alert:1531250980199338064>').setStyle(ButtonStyle.Danger)
                );

                await ch.send({ content: fullPingContent, embeds: [embed], components: [row] });
                return await interaction.editReply({ content: `Ticket generated successfully: ${ch}` });
            }

            const store = await GuildStore.findOne({ guildId });
            if (!store) return;

            if (interaction.customId === 'store_category_select') {
                const chosenCat = interaction.values[0].replace('store_cat_', '');
                const filteredItems = store.items.filter(i => i.category === chosenCat);

                if (filteredItems.length === 0) return await interaction.reply({ content: '❌ No items available in this category.', ephemeral: true });

                const options = filteredItems.map(i => ({ label: `${i.name} - ${i.price} INR`, value: `store_itm_${i._id.toString()}` }));
                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('store_item_select').setPlaceholder('📦 Choose an item to purchase...').addOptions(options)
                );

                return await interaction.reply({ content: `📁 Selected Category: **${chosenCat}**`, components: [row], ephemeral: true });
            }

            if (interaction.customId === 'store_item_select') {
                const itemDbId = interaction.values[0].replace('store_itm_', '');
                const targetItem = store.items.find(i => i._id.toString() === itemDbId);

                const buyRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`btn_trigger_checkout_${itemDbId}`).setLabel(`Order: ${targetItem.name} (${targetItem.price} INR)`).setStyle(ButtonStyle.Primary)
                );

                return await interaction.reply({ content: `🛒 Proceed to purchase **${targetItem.name}**? Click below to verify your in-game username:`, components: [buyRow], ephemeral: true });
            }
        }
    } catch (err) {
        console.error("Interaction Exception Handled:", err);
    }
});

// ================= TIMED LOOP =================
setInterval(async () => {
    try {
        // 1. Stats Channel Update
        const stats = await GuildConfig.find({ totalMembersChan: { $ne: null } });
        for (const config of stats) {
            const g = await client.guilds.fetch(config.guildId).catch(() => null);
            if (!g) continue;
            if (config.totalMembersChan) {
                const chan = g.channels.cache.get(config.totalMembersChan);
                if (chan) await chan.setName(`🪐 Total Members: ${g.memberCount}`).catch(() => null);
            }
        }

        // 2. Staff Application 30-Min Timeout Check
        const expiredSessions = await StaffAppSession.find({ createdAt: { $lte: new Date(Date.now() - 30 * 60 * 1000) } });
        for (const session of expiredSessions) {
            const guild = await client.guilds.fetch(session.guildId).catch(() => null);
            if (guild) {
                const chan = guild.channels.cache.get(session.channelId);
                if (chan) {
                    await chan.send({ content: '⏰ **Application Timed Out!** You failed to complete the application within 30 minutes, so it has been automatically rejected and closed.' }).catch(() => {});
                    setTimeout(() => chan.delete().catch(() => {}), 5000);
                }
            }
            await StaffAppSession.deleteOne({ _id: session._id });
        }

        // 3. Pending Order Reminders (12h)
        const twelveHoursAgo = new Date(Date.now() - (12 * 60 * 60 * 1000));
        const pendingTickets = await OrderTicket.find({ lastReminderSent: { $lte: twelveHoursAgo } });

        for (const ticket of pendingTickets) {
            const store = await GuildStore.findOne({ guildId: ticket.guildId });
            if (!store) continue;

            const buyer = await client.users.fetch(ticket.buyerId).catch(() => null);
            if (buyer) {
                const msgTemplate = (store.dmPendingReminder || "This is a reminder that your order for **{{item}}** at **{{server}}** is currently pending review.");
                const msg = msgTemplate
                    .replace(/{{server}}/g, store.serverName)
                    .replace(/{{item}}/g, ticket.itemName);

                const reminderEmbed = new EmbedBuilder()
                    .setTitle('⏰ PENDING ORDER REMINDER')
                    .setDescription(msg)
                    .setColor('#FFA500')
                    .setTimestamp();

                await buyer.send({ embeds: [reminderEmbed] }).catch(() => null);
                ticket.lastReminderSent = new Date();
                await ticket.save();
            }
        }

        // 4. YouTube RSS Feed Alerts (Direct Live/Uploads without restriction)
        const yts = await GuildConfig.find({ ytChannelId: { $ne: null } });
        for (const config of yts) {
            const feed = await parser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${config.ytChannelId}`).catch(() => null);
            if (!feed || !feed.items || feed.items.length === 0) continue;
            const item = feed.items[0];
            const g = await client.guilds.fetch(config.guildId).catch(() => null);
            if (!g) continue;

            const isLive = item.title.toLowerCase().includes('live') || item.title.toLowerCase().includes('stream');
            const target = isLive ? config.ytLiveChannel : config.ytUploadChannel;
            if (target) {
                const c = g.channels.cache.get(target);
                if (c) {
                    const msg = isLive ? `🔴 **LIVE STREAM STARTED!** \n📢 **${item.title}**\n👉 ${item.link} @everyone` : `🎬 **NEW VIDEO UPLOADED!** \n📢 **${item.title}**\n👉 ${item.link} @everyone`;
                    await c.send({ content: msg }).catch(() => null);
                }
            }
        }
    } catch (e) { console.error("Background Loop Exception:", e); }
}, 300000);

client.login(process.env.DISCORD_TOKEN);
