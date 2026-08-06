const mongoose = require('mongoose');

const GuildConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    welcomeTitle: { type: String, default: '' },
    welcomeMessage: { type: String, default: '' },
    welcomeChannel: { type: String, default: '' },
    welcomeThumbnail: { type: String, default: '' },
    welcomeDm: { type: String, default: '' },
    
    totalMembersChan: { type: String, default: null },
    memberGoal: { type: Number, default: 100 },
    goalReachedSent: { type: Boolean, default: false },
    inviteLogChannel: { type: String, default: null },
    
    ticketDescription: { type: String, default: '' },
    ticketBanner: { type: String, default: '' }, // Added banner field for tickets
    ticketParent: { type: String, default: '' },
    ticketLogs: { type: String, default: '' },
    ticketRole: { type: String, default: '' },   
    ticketMessage: { type: String, default: '' },
    ticketImage: { type: String, default: '' },   

    // Staff Application Config
    appChannelId: { type: String, default: null },
    appStaffChannelId: { type: String, default: null },
    appQuestions: { type: [String], default: ['What is your full name and age?', 'Why do you wish to join our staff team?', 'Do you have any prior moderation experience?'] },
    appStaffRoleId: { type: String, default: '' },
    appDmApproved: { type: String, default: 'Your application for {{server}} has been successfully approved. Welcome aboard!' },
    appDmRejected: { type: String, default: 'Thank you for your interest. Unfortunately, your staff application for {{server}} was declined at this time.' },

    ytChannelId: { type: String, default: null },
    ytLiveChannel: { type: String, default: null },
    ytUploadChannel: { type: String, default: null },

    autoResponses: [
        {
            trigger: { type: String, lowercase: true, trim: true },
            replyText: { type: String }
        }
    ]
});

// Staff Application Session Schema with timestamp tracking for 30 min auto-expire
const StaffAppSessionSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    currentQuestionIndex: { type: Number, default: 0 },
    answers: [String],
    createdAt: { type: Date, default: Date.now, expires: 1800 } // Auto deletes document and expires after 30 minutes (1800 seconds)
});

// Custom VC Config Schema
const CustomVCConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    sourceChannelId: { type: String, required: true },
    categoryId: { type: String, required: true }
});

// Active Custom VCs tracking Schema
const ActiveVCSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true, unique: true },
    ownerId: { type: String, required: true }
});

module.exports = {
    GuildConfig: mongoose.model('GuildConfig', GuildConfigSchema),
    StaffAppSession: mongoose.model('StaffAppSession', StaffAppSessionSchema),
    CustomVCConfig: mongoose.model('CustomVCConfig', CustomVCConfigSchema),
    ActiveVC: mongoose.model('ActiveVC', ActiveVCSchema)
};
