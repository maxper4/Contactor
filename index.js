const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const ipc = require('node-ipc');
const { writeFileSync } = require("fs");
const { spawn, fork } = require("child_process");

const FILE_TO_REMIND = "./Data/toRemind.json";
const DUMP_FILE = "./Data/dump.json";

let config = require("./config.json");

const discord = new Client({intents: [GatewayIntentBits.DirectMessages], partials: ["MESSAGE", "CHANNEL", "REACTION"]});

discord.login(config.DISCORD_BOT_TOKEN);

ipc.config.id = "contactor";
ipc.config.retry = 1500;
ipc.config.silent = false;

ipc.serveNet(() => 
{
    ipc.server.on('alert', (message, socket) => {
        try {
            message = JSON.parse(message);
        } catch (error) {
            console.log("Error while parsing message: " + error);
            return;
        }

        console.log("Received alert: ", message);
        if(config.DUMPING_ALERTS.includes(message.id)) {
            const record = {
                timestamp: Date.now(),
                from: message.id,
                message: message.message,
            };
            dump.push(record);
            writeFileSync(DUMP_FILE, JSON.stringify(dump, null, 4));
        }

        toContactOnAlert.forEach(nickname => {
            if(contacts[nickname] && !config.CONTACTS.find(x => x.nickname == nickname).mutedAlerts.includes(message.id))
                sendMessage(nickname, message.message);
        });
    });

    ipc.server.on("ping", (message, socket) => {
        console.log("Received ping: ", message);
        ipc.server.emit(socket, "pong", "pong");
    });

    ipc.server.on("test-running", (message, socket) => {
        ipc.server.emit(socket, "test-running", "good");
    })

    ipc.server.on("getContacts", (message, socket) => {
        ipc.server.emit(socket, "contacts", config.CONTACTS.map(x => x.nickname));
    });

    ipc.server.on("removeContact", (message, socket) => {
        if(!config.CONTACTS.find(x => x.nickname == message)) {
            ipc.server.emit(socket, "contactRemoved", "false");
            return;
        }

        config.CONTACTS = config.CONTACTS.filter(x => x.nickname != message);
        saveConfig();
        setup();
        ipc.server.emit(socket, "contactRemoved", "true");
    });

    ipc.server.on("addContact", (message, socket) => {
        if(config.CONTACTS.find(x => x.nickname == message.nickname)) {
            ipc.server.emit(socket, "contactAdded", "false");
            return;
        }

        let contact = {
            nickname: message.nickname,
            discordId: message.discordId,
            permissions: message.permissions,
            mutedAlerts: [],
        };
        config.CONTACTS.push(contact);
        saveConfig();
        setup();
        ipc.server.emit(socket, "contactAdded", "true");
    });
});
ipc.server.start();

ipc.connectToNet('botsmanager', 8001, () => {
    ipc.of.botsmanager.on('connect', () => {
        console.log('Connected to bots-manager');
    });
});

const reloadModule = (moduleName) => {
    delete require.cache[require.resolve(moduleName)]
    console.log('Reloading ' + moduleName + "...");
    return require(moduleName)
}

const saveConfig = () => {
    writeFileSync("./config.json", JSON.stringify(config, null, 4));
}

const loadContact = async(contact) => {
    try {
        contacts[contact.nickname] = await discord.users.fetch(contact.discordId, false);
    } catch (error) {
        console.log("Error while fetching contact " + contact.nickname + ": " + error);
    }
}

let contacts = {};
let toContactOnAlert = [];
let toRemind = [];
let dump = [];
const setup = async() => {
    config = reloadModule("./config.json");

    contacts = {};
    await Promise.all(config.CONTACTS.map(loadContact));

    toContactOnAlert = config.TO_CONTACT_ON_ALERT;

    try {
        toRemind = reloadModule(FILE_TO_REMIND);
    } catch (error) {
        writeFileSync(FILE_TO_REMIND, JSON.stringify([], null, 4));
    }
    for(let i = 0; i < toRemind.length; i++) {
        const reminder = toRemind[i];
        if(reminder.time <= Date.now()) {
            sendMessage(reminder.nickname, "[Contactor] I was offline but I should have reminded you " + ((Date.now() - reminder.time) / 1000)  + "s about: " + reminder.message);
            toRemind.splice(i, 1);
            i--;
        }
    }

    writeFileSync(FILE_TO_REMIND, JSON.stringify(toRemind, null, 4));

    toRemind.forEach(reminder => {
        setTimeout(() => {
            sendMessage(reminder.nickname, "[Contactor] Reminding you: " + reminder.message);
            toRemind = toRemind.filter(x => x != reminder);
            writeFileSync(FILE_TO_REMIND, JSON.stringify(toRemind, null, 4));
        }, reminder.time - Date.now());
    });

    try {
        dump = reloadModule(DUMP_FILE);
    } catch (error) {
        writeFileSync(DUMP_FILE, JSON.stringify([], null, 4));
    }

    console.log("Contacts: ", contacts);
    console.log("Setup done.");

    toContactOnAlert.forEach(nickname => {
        sendMessage(nickname, "[Contactor] Setup done.");
    });
};

const OnReceiveDiscordMessage = (discordId, message) => {
    if (!ContactByDiscordId(discordId)) return;
    const user = ContactByDiscordId(discordId);
    const nickname = user.nickname;
    const perms = user.permissions;

    if(config.DUMPING_ALERTS.includes(nickname)) {
        const record = {
            timestamp: Date.now(),
            from: nickname,
            message: message,
        };
        dump.push(record);
        writeFileSync(DUMP_FILE, JSON.stringify(dump, null, 4));
    }

    if(message == "ping") sendMessage(nickname, "pong");
    else if(message == "reload") if (perms >= 2) setup(); else sendMessage(nickname, "[Contactor] You don't have permission to do that.");
    else if(message == "nickname") sendMessage(nickname, nickname);
    else if(message.startsWith("restart ")) {
        if(perms < 3) {
            sendMessage(nickname, "[Contactor] You don't have permission to do that.");
            return;
        }

        const command = message.replace("restart ", "");
        if(command == "contactor") {
            setTimeout(function () {
                process.on("exit", function () {
                    spawn(process.argv.shift(), process.argv, {
                        cwd: process.cwd(),
                        detached : true,
                        stdio: "inherit"
                    });
                });
                process.exit();
            }, 5000);
            sendMessage(nickname, "[Contactor] Restarting...");
        }
        else {
            sendMessage(nickname, "Unknown thing to restart. You might try 'help'.");
        }
    }
    else if(message.startsWith("stop ")) {
        if(perms < 3) {
            sendMessage(nickname, "[Contactor] You don't have permission to do that.");
            return;
        } 

        const command = message.replace("stop ", "");
        if(command == "contactor"){
            sendMessage(nickname, "[Contactor] Stopping...");
            setTimeout(function () {
                process.exit();
            }, 3000);
        }
        else {
            sendMessage(nickname, "Unknown thing to stop. You might try 'help'.");
        }
    }
    else if(message.startsWith("add contact")) {
        if(perms < 3) {
            sendMessage(nickname, "[Contactor] You don't have permission to do that.");
            return;
        } 

        const contact = message.replace("add contact ", "").split(" ");
        if(contact.length != 2 && contact.length != 3) {
            sendMessage(nickname, "Invalid syntax: add contact <nickname> <discord id> <permissions (optional)>");
            return;
        } 
        
        let newContactPerms = 0;
        try {
            newContactPerms = parseInt(contact[2]);
        } catch (error) {
            
        }
        const newContact = {
            nickname: contact[0],
            discordId: contact[1],
            permissions: newContactPerms
        };

        config.CONTACTS.push(newContact);
        saveConfig();

        loadContact(newContact);
    }
    else if(message.startsWith("remove contact")) {
        if(perms < 3) {
            sendMessage(nickname, "[Contactor] You don't have permission to do that.");
            return;
        } 

        const contact = message.replace("remove contact ", "");
        if(contact.length == 0) {
            sendMessage(nickname, "Invalid syntax: remove contact <nickname>");
            return;
        }

        config.CONTACTS = config.CONTACTS.filter(x => x.nickname != contact);
        saveConfig();

        delete contacts[contact];
    }
    else if(message.startsWith("show contact")) {
        if(perms < 3) {
            sendMessage(nickname, "[Contactor] You don't have permission to do that.");
            return;
        } 

        const contact = message.replace("show contact ", "");
        if(contact.length == 0) {
            sendMessage(nickname, "Invalid syntax: show contact <nickname>");
            return;
        }

        const contactData = config.CONTACTS.find(x => x.nickname == contact);
        if(!contactData) {
            sendMessage(nickname, "That contact doesn't exist.");
            return;
        }

        sendMessage(nickname, "Nickname: " + contactData.nickname + "\nDiscord ID: " + contactData.discordId + "\nPermissions: " + contactData.permissions);
    }
    else if(message.startsWith("set permissions")) {
        if(perms < 3) {
            sendMessage(nickname, "[Contactor] You don't have permission to do that.");
            return;
        } 

        const contact = message.replace("set permissions ", "").split(" ");
        if(contact.length != 2) {
            sendMessage(nickname, "Invalid syntax: set permissions <nickname> <permissions>");
            return;
        }

        const contactData = config.CONTACTS.find(x => x.nickname == contact[0]);
        if(!contactData) {
            sendMessage(nickname, "That contact doesn't exist.");
            return;
        }

        let newContactPerms = 0;
        try {
            newContactPerms = parseInt(contact[1]);
        } catch (error) {
            sendMessage(nickname, "Invalid permissions.");
        }

        contactData.permissions = newContactPerms;
        
        saveConfig();

        sendMessage(nickname, "[Contactor] Permissions set.");
    }
    else if(message.startsWith("set nickname")) {
        const contact = message.replace("set nickname ", "").split(" ");
        if(contact.length != 2) {
            sendMessage(nickname, "Invalid syntax: set nickname <nickname> <new nickname>");
            return;
        }

        if(contact[0] == contact[1]) return sendMessage(nickname, "That's already the nickname.");
        if(config.CONTACTS.find(x => x.nickname == contact[1])) return sendMessage(nickname, "That nickname is already taken.");

        const contactData = config.CONTACTS.find(x => x.nickname == contact[0]);
        if(!contactData) {
            sendMessage(nickname, "That contact doesn't exist.");
            return;
        }

        if(contactData.permissions > perms) return sendMessage(nickname, "You don't have permission to do that.");

        contactData.nickname = contact[1];

        contacts[contactData.nickname] = contacts[contact[0]];
        delete contacts[contact[0]];

        saveConfig();

        sendMessage(nickname, "[Contactor] Nickname set.");
    }
    else if(message.startsWith("set discord id")) {
        const contact = message.replace("set discord id ", "").split(" ");
        if(contact.length != 2) {
            sendMessage(nickname, "Invalid syntax: set discord id <nickname> <new discord id>");
            return;
        }

        const contactData = config.CONTACTS.find(x => x.nickname == contact[0]);
        if(!contactData) {
            sendMessage(nickname, "That contact doesn't exist.");
            return;
        }

        if(contactData.permissions > perms) return sendMessage(nickname, "You don't have permission to do that.");

        contactData.discordId = contact[1];

        saveConfig();

        sendMessage(nickname, "[Contactor] Discord ID set.");
    }
    else if(message.startsWith("add alerted")) {
        if(perms < 3) {
            sendMessage(nickname, "[Contactor] You don't have permission to do that.");
            return;
        }

        const contact = message.replace("add alerted ", "");
        if(contact.length == 0) {
            sendMessage(nickname, "Invalid syntax: add alerted <nickname>");
            return;
        }

        if(toContactOnAlert.includes(contact)) return sendMessage(nickname, "That contact is already alerted.");

        config.TO_CONTACT_ON_ALERT.push(contact);
        
        saveConfig();

        toContactOnAlert.push(contact);

        sendMessage(nickname, "[Contactor] Contact added to alert list.");
    }
    else if(message.startsWith("remove alerted")) {
        if(perms < 3) {
            sendMessage(nickname, "[Contactor] You don't have permission to do that.");
            return;
        } 

        const contact = message.replace("remove alerted ", "");
        if(contact.length == 0) {
            sendMessage(nickname, "Invalid syntax: remove alerted <nickname>");
            return;
        }

        if(!toContactOnAlert.includes(contact)) {
            sendMessage(nickname, "That contact is not alerted.");
            return;
        }

        config.TO_CONTACT_ON_ALERT = config.TO_CONTACT_ON_ALERT.filter(x => x != contact);
        saveConfig();

        toContactOnAlert = toContactOnAlert.filter(x => x != contact);

        sendMessage(nickname, "[Contactor] Contact removed from alert list.");
    }
    else if(message.startsWith("remind me")) {
        const reminder = message.replace("remind me ", "").split(" ");
        if(reminder.length < 2) {
            sendMessage(nickname, "Invalid syntax: remind me <time> <message>");
            return;
        }

        const time = reminder[0];
        const messageRemind = reminder.slice(1).join(" ");

        const timeRegex = /(\d+)([smhd])/;
        const timeMatch = timeRegex.exec(time);
        if(!timeMatch) {
            sendMessage(nickname, "Invalid time format. Use the following format: <number><s|m|h|d> (e.g. 5m for 5 minutes)");
            return;
        }

        const timeNumber = parseInt(timeMatch[1]);
        const timeUnit = timeMatch[2];

        let timeMs = 0;
        switch (timeUnit) {
            case "s":
                timeMs = timeNumber * 1000;
                break;
            case "m":
                timeMs = timeNumber * 1000 * 60;
                break;
            case "h":
                timeMs = timeNumber * 1000 * 60 * 60;
                break;
            case "d":
                timeMs = timeNumber * 1000 * 60 * 60 * 24;
                break;
        }

        const timeRemind = Date.now() + timeMs;

        toRemind.push({
            nickname: nickname,
            message: messageRemind,
            time: timeRemind
        });

        writeFileSync(FILE_TO_REMIND, JSON.stringify(toRemind, null, 4));

        setTimeout(() => {
            sendMessage(nickname, "[Contactor] Reminding you: " + messageRemind);
            toRemind = toRemind.filter(x => x.nickname != nickname && x.message != messageRemind && x.time != timeRemind);
            writeFileSync(FILE_TO_REMIND, JSON.stringify(toRemind, null, 4));
        }, timeMs);

        sendMessage(nickname, "[Contactor] Reminder set for " + timeNumber + timeUnit + ".");
    }
    else if(message.startsWith("add muted")) {
        const name = message.replace("add muted ", "");
        if(name.length == 0) {
            sendMessage(nickname, "Invalid syntax: add muted <nickname | bot name>");
            return;
        }

        const contact = config.CONTACTS.find(x => x.nickname == name);
        if(contact.mutedAlerts.includes(name)){
            sendMessage(nickname, "Already muted.");
            return;
        }

        contact.mutedAlerts.push(nickname);
        saveConfig();

        sendMessage(nickname, "[Contactor] Muted.");
    }
    else if(message.startsWith("remove muted")) {
        const name = message.replace("remove muted ", "");
        if(name.length == 0) {
            sendMessage(nickname, "Invalid syntax: remove muted <nickname | bot name>");
            return;
        }

        const contact = config.CONTACTS.find(x => x.nickname == name);
        if(!contact.mutedAlerts.includes(name)){
            sendMessage(nickname, "Not muted.");
            return;
        }

        contact.mutedAlerts = contact.mutedAlerts.filter(x => x != nickname);
        saveConfig();

        sendMessage(nickname, "[Contactor] Unmuted.");
    }
    else if(message.startsWith("add dumping")) {
        if(perms < 3) {
            sendMessage(nickname, "[Contactor] You don't have permission to do that.");
            return;
        }

        const name = message.replace("add dumping ", "");
        if(name.length == 0) {
            sendMessage(nickname, "Invalid syntax: add dumping <nickname | bot name>");
            return;
        }

        if(config.DUMPING_ALERTS.includes(name)){
            sendMessage(nickname, "Already dumping.");
            return;
        }

        config.DUMPING_ALERTS.push(name);
        saveConfig();

        sendMessage(nickname, "[Contactor] Dumping.");
    }
    else if(message.startsWith("remove dumping")) {
        if(perms < 3) {
            sendMessage(nickname, "[Contactor] You don't have permission to do that.");
            return;
        }

        const name = message.replace("remove dumping ", "");
        if(name.length == 0) {
            sendMessage(nickname, "Invalid syntax: remove dumping <nickname | bot name>");
            return;
        }

        if(!config.DUMPING_ALERTS.includes(name)){
            sendMessage(nickname, "Wasn't dumping.");
            return;
        }

        config.DUMPING_ALERTS = config.DUMPING_ALERTS.filter(x => x != name);
        saveConfig();

        sendMessage(nickname, "[Contactor] Not dumping.");
    }
    else if(message.startsWith("clear dumping")) {
        if(perms < 3) {
            sendMessage(nickname, "[Contactor] You don't have permission to do that.");
            return;
        }

        dump = [];
        writeFileSync(DUMP_FILE, JSON.stringify(dump, null, 4));

        sendMessage(nickname, "[Contactor] Dumping alerts cleared.");
    }
    else if(message.startsWith("dump")) {
        if(perms < 3) {
            sendMessage(nickname, "[Contactor] You don't have permission to do that.");
            return;
        }

        const id = message.replace("dump ", "").split(" ");
        if(id.length == 0) {
            sendMessage(nickname, JSON.stringify(dump, null, 4));
        }
        else {
            sendMessage(nickname, JSON.stringify(dump.filter(x => id.includes(x.from)), null, 4));
        }
    }
    else if(message.startsWith("start")) {
        if(perms < 3) {
            sendMessage(nickname, "[Contactor] You don't have permission to do that.");
            return;
        }

        const args = message.replace("start ", "").split(" ");
        if(args.length == 0) {
            sendMessage(nickname, "Invalid syntax: start <bot name> (<args>)");
            return;
        }

        ipc.of.botsmanager.emit("start", JSON.stringify({ bot: args[0], args: args.slice(1)}));
    }
    else if(message.startsWith("dm ")) {
        const contact = message.replace("dm ", "").split(" ");
        if(contact.length < 2) {
            sendMessage(nickname, "Invalid syntax: dm <nickname> <message>");
            return;
        }

        const messageToSend = contact.slice(1).join(" ");

        if(contacts[contact[0]] && config.CONTACTS.find(x => x.nickname == contact[0]).mutedAlerts.includes(nickname)) {
            sendMessage(nickname, "You are muted by that contact.");
            return;
        }

        sendMessage(contact[0], "[Contactor] " + nickname + " sent you a message: " + messageToSend);
    }
    else if(message == "list contacts") if (perms >= 2) sendMessage(nickname, "[Contactor] Contacts: " + Object.keys(contacts).join(", ")); else sendMessage(nickname, "[Contactor] You don't have permission to do that.");
    else if(message == "list alerteds") if (perms >= 2) sendMessage(nickname, "[Contactor] Alerts: " + toContactOnAlert.join(", ")); else sendMessage(nickname, "[Contactor] You don't have permission to do that.");
    else if(message == "time") { sendMessage(nickname, "[Contactor] Current timestamp: " + Date.now()); sendMessage(nickname, "[Contactor] Current date: " + new Date().toLocaleString()); }
    else if(message == "thanks" || message == "thank you") { 
        const answers = ["You're welcome! :)", "No problem !", "It's ok", "Good boy", ":thumbsup:", "It's my job !", "I don't have the choice...", "I'm just a bot...", "Ratio", "Anytime", "I don't like you"]; 
        sendMessage(nickname, answers[Math.floor((Math.random()*answers.length))]);
    }
    else if(message == "help") sendMessage(nickname, "Available commands (permissions needed or empty if none): ping\n reload (2)\n nickname\n restart contactor (2)\n stop contactor (2)\n add contact <nickname> <discord id> <permissions> (3)\n remove contact <nickname> (3)\n show contact <nickname> (3)\n"+
        "set nickname <old nickname> <new nickname> (more than old nickname)\n set discord id <nickname> <new discord id> (more than nickname)\n set permissions <nickname> <permission> (3)\n"
        + "add alerted <name|bot> (3)\n remove alerted <name|bot> (3)\n remind me <time> <msg>\n add muted <name | bot>\n remove muted <name | bot>\n add dumping <name | bot> (3)\n remove dumping <name | bot> (3)\n clear dumping (3)\n "
        + "dump (<ids>) (3)\n start <bot> (<args>) (3)\n dm <nickname> <msg>\n list contacts|alerteds (2)\n help");
    else sendMessage(nickname, "Unknown command. You might try 'help'.");

    console.log(nickname, message);
};

const ContactByDiscordId = (discordId) => {
    return config.CONTACTS.find(x => x.discordId == discordId);
};

const sendMessage = (nickname, message) => {
    console.log("Sending message to " + nickname + ": " + message);
    if (!contacts[nickname]) return;

    contacts[nickname].send(message);
};

discord.on("ready", async() => {
    discord.on("messageCreate", async message => {
        if (message.author.bot) return;
        if (message.channel.type != ChannelType.DM) return;

        OnReceiveDiscordMessage(message.author.id, message.content);
    });
    
    await setup();
});