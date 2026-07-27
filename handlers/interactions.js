const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const { GuildConfig, StaffAppSession } = require('../models/GuildConfig');
const { GuildStore, OrderTicket } = require('../models/GuildStore');
const InviteData = require('../models/InviteData');

const OWNER_ID = "1266728371719508062";

module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {
        try {
            if (!interaction.guild && interaction.user.id === OWNER_ID) {
                if (interaction.isStringSelectMenu() && interaction.customId === 'dm_select_server_bot') {
                    const selectedGuildId = interaction.values[0];
                    const guild = client.guilds.cache.get(selectedGuildId);
                    if (!guild) return interaction.reply({ content: '❌ Guild not found.', ephemeral: true });

                    return interaction.update({ 
                        content: `✅ Selected Server: **${guild.name}**\nClick below to leave this server if needed:`, 
                        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`confirm_leave_${selectedGuildId}`).setLabel(`Leave ${guild.name}`).setStyle(ButtonStyle.Danger))] 
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
                }
                return;
            }

            const guildId = interaction.guild?.id;
            if (!guildId) return;

            // 1. Slash Commands
            if (interaction.isChatInputCommand()) {
                const command = client.commands.get(interaction.commandName);
                if (command) await command.execute(interaction);
                return;
            }

            // 2. Buttons
            if (interaction.isButton()) {
                if (interaction.customId === 'btn_inv_guild_lb') {
                    await interaction.deferReply();
                    const dbData = await InviteData.find({ guildId });
                    const sorted = dbData.map(d => ({ userId: d.userId, total: d.permRegular - d.permLeaves - d.permFake })).sort((a, b) => b.total - a.total).slice(0, 10);
                    if (sorted.length === 0) return await interaction.followUp({ content: '❌ No active invite stats found.' });

                    let str = '```text\n';
                    for (let i = 0; i < sorted.length; i++) {
                        const u = await client.users.fetch(sorted[i].userId).catch(() => null);
                        str += `${i+1}. ${(u ? u.username : 'Unknown').padEnd(12, ' ')} • ${sorted[i].total} Invites\n`;
                    }
                    str += '```';
                    const embed = new EmbedBuilder().setTitle('<a:trophy:1531251182713045023> TOP 10 INVITES').setDescription(str).setColor('#00FF00');
                    return await interaction.followUp({ embeds: [embed] });
                }

                if (interaction.customId === 'setup_app_config') {
                    const store = await GuildConfig.findOne({ guildId });
                    const modal = new ModalBuilder().setCustomId('modal_app_config').setTitle('Configure Staff Application');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_staff_chan').setLabel('Staff Review Channel ID').setRequired(true).setStyle(TextInputStyle.Short).setValue(store?.appStaffChannelId || '')),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_role').setLabel('Staff Role ID').setRequired(true).setStyle(TextInputStyle.Short).setValue(store?.appStaffRoleId || '')),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_qs').setLabel('Questions (Separated by ||)').setRequired(true).setStyle(TextInputStyle.Paragraph).setValue(store?.appQuestions?.join(' || ') || ''))
                    );
                    return await interaction.showModal(modal);
                }

                if (interaction.customId === 'deploy_app_panel') {
                    const modal = new ModalBuilder().setCustomId('modal_deploy_app').setTitle('Deploy Application Panel');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_target_chan').setLabel('Target Channel ID').setRequired(true).setStyle(TextInputStyle.Short)));
                    return await interaction.showModal(modal);
                }

                if (interaction.customId === 'btn_start_staff_apply') {
                    const config = await GuildConfig.findOne({ guildId });
                    const appChannel = await interaction.guild.channels.create({
                        name: `app-${interaction.user.username}`,
                        permissionOverwrites: [
                            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                        ]
                    });
                    await StaffAppSession.create({ userId: interaction.user.id, guildId, channelId: appChannel.id, currentQuestionIndex: 0, answers: [] });
                    await appChannel.send({ content: `${interaction.user}\n\n📝 **Staff Application Started!**\n**Question 1:** ${config.appQuestions[0]}` });
                    return await interaction.reply({ content: `✅ Application channel created: ${appChannel}`, ephemeral: true });
                }

                if (interaction.customId.startsWith('app_approve_') || interaction.customId.startsWith('app_reject_')) {
                    const isApprove = interaction.customId.startsWith('app_approve_');
                    const targetUserId = interaction.customId.replace(isApprove ? 'app_approve_' : 'app_reject_', '');
                    const config = await GuildConfig.findOne({ guildId });
                    const targetUser = await client.users.fetch(targetUserId).catch(() => null);

                    if (targetUser) {
                        const msg = (isApprove ? config?.appDmApproved : config?.appDmRejected).replace(/{{server}}/g, interaction.guild.name);
                        await targetUser.send({ embeds: [new EmbedBuilder().setTitle(isApprove ? 'APPROVED' : 'DECLINED').setDescription(msg).setColor(isApprove ? '#00FF00' : '#FF0000')] }).catch(() => {});
                    }
                    await interaction.update({ components: [] });
                }
            }

            // 3. Modals
            if (interaction.isModalSubmit()) {
                await interaction.deferReply({ ephemeral: true });
                if (interaction.customId === 'modal_deploy_app') {
                    const targetChanId = interaction.fields.getTextInputValue('app_target_chan').trim();
                    const targetChan = interaction.guild.channels.cache.get(targetChanId);
                    const embed = new EmbedBuilder().setTitle('<a:announcement:1531251217525768324> STAFF APPLICATION').setDescription('Click below to apply.').setColor('#5865F2');
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_start_staff_apply').setLabel('Apply').setEmoji('<a:welcome:1531251234147794964>').setStyle(ButtonStyle.Primary));
                    await targetChan.send({ embeds: [embed], components: [row] });
                    return await interaction.editReply({ content: '✅ Panel deployed successfully!' });
                }
            }
        } catch (err) { console.error("Interaction Router Error:", err); }
    });
};
