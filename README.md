## Contactor

Contactor is a server listening for incoming communications from others bots (using node-ipc) to send them to the owner via discord private messages (DM).
This way, you don't need to be online to receive alerts from your bots, or to have an SMTP server.

### Installation

1. Clone the repository
2. Install the dependencies with `npm install`
3. Create a discord bot and get its token (https://discordjs.guide/preparations/setting-up-a-bot-application.html#your-bot-s-token)
4. Create a file named `config.json` in the root directory of the project.
Example:
```json
{
    "DISCORD_BOT_TOKEN": "your discord bot token",
    "CONTACTS": [
        { 
            "nickname": "owner (a nickname you want to use to contact the owner)",
            "discordId": "your discord id (not the nickname, found with the developer mode)",
            "permissions": 3,
            "mutedAlerts": []
        }
    ],
    "TO_CONTACT_ON_ALERT": [
        "owner"
    ],
    "DUMPING_ALERTS": [
        "web-change-listener"
    ]
}
```
Permission levels:
- 1 : basic contact, can receive messages, ping the server and get its nickname
- 2 : intermediate contact, can also reload the config file, list contacts
- 3 : admin contact, can do everything


Muted alerts are the alerts that the contact will not receive. They are the names of the bots that send the alerts. It allows you to mute alerts from bots that you don't want to receive but to still be in the contact on alert list. Also applies for users.

5. Run the server with `npm start`

### Commands available
Commands are sent to the bot via discord private messages (DM) and need that you are registered as a contact.

- ping : check if the bot is alive (should reply pong)
- nickname : get the nickname of the contact
- reload : reload the config file